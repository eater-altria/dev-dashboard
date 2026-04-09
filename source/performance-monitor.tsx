import { execFile } from 'node:child_process';
import os from 'node:os';
import process from 'node:process';
import { promisify } from 'node:util';
import React, { useEffect, useRef, useState } from 'react';
import { Box, Text } from 'ink';
import si from 'systeminformation';

const execFileAsync = promisify(execFile);

type FsSizeEntry = Awaited<ReturnType<typeof si.fsSize>>[number];

type Props = {
	readonly isActive: boolean;
};

// ── GPU types ───────────────────────────────────────────────

type GpuState =
	| {
		kind: 'ok';
		deviceUtilization: number;
		rendererUtilization: number;
		tilerUtilization: number;
		inUseMemory: number;
	}
	| {
		kind: 'unsupported';
		reason: string;
	};

// ── CPU topology (static, fetched once) ─────────────────────

type CpuTopology = {
	model: string;
	perfCores: number;
	effCores: number;
};

// ── Temperature ─────────────────────────────────────────────

type TempData = {
	cpu: number | null;
	gpu: number | null;
	soc: number | null;
};

// ── Core load entry ─────────────────────────────────────────

type CoreLoad = {
	load: number;
};

// ── Aggregated metrics ──────────────────────────────────────

type MetricsState =
	| {
		kind: 'ok';
		cpu: number;
		cpuCores: CoreLoad[];
		cpuTopology?: CpuTopology;
		temp?: TempData;
		memTotal: number;
		memActive: number;
		memBuffcache: number;
		memAvailable: number;
		swapUsed: number;
		swapTotal: number;
		diskMount: string;
		diskAvailable: number;
		diskSize: number;
		diskUsedPercent: number;
		diskReadSpeed?: number;
		diskWriteSpeed?: number;
		gpu: GpuState;
	}
	| {
		kind: 'error';
		message: string;
	};

// ── Helpers ─────────────────────────────────────────────────

function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${Math.round(bytes)} B`;
	}

	const kb = bytes / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB`;
	}

	const mb = kb / 1024;
	if (mb < 1024) {
		return `${mb.toFixed(1)} MB`;
	}

	return `${(mb / 1024).toFixed(2)} GB`;
}

function formatSpeed(bytesPerSec: number): string {
	if (bytesPerSec < 1024) {
		return `${Math.round(bytesPerSec)} B/s`;
	}

	const kb = bytesPerSec / 1024;
	if (kb < 1024) {
		return `${kb.toFixed(1)} KB/s`;
	}

	const mb = kb / 1024;
	if (mb < 1024) {
		return `${mb.toFixed(1)} MB/s`;
	}

	return `${(mb / 1024).toFixed(2)} GB/s`;
}

function clampPercent(n: number): number {
	return Math.min(100, Math.max(0, n));
}

function barColor(percent: number): 'green' | 'yellow' | 'red' {
	if (percent < 60) {
		return 'green';
	}

	if (percent < 85) {
		return 'yellow';
	}

	return 'red';
}

function tempColor(temp: number): 'green' | 'yellow' | 'red' {
	if (temp < 50) {
		return 'green';
	}

	if (temp < 80) {
		return 'yellow';
	}

	return 'red';
}

function ProgressBar({
	percent,
	width,
}: {
	readonly percent: number;
	readonly width: number;
}) {
	const p = clampPercent(percent);
	const filled = Math.round((p / 100) * width);
	const empty = width - filled;
	const color = barColor(p);
	return (
		<Text>
			<Text color={color}>{'█'.repeat(filled)}</Text>
			<Text dimColor>{'░'.repeat(empty)}</Text>
			<Text> {p.toFixed(1)}%</Text>
		</Text>
	);
}

// ── Data fetchers ───────────────────────────────────────────

/**
 * Fetch Apple Silicon CPU topology via sysctl (run once).
 * Returns null on non-macOS or non-Apple-Silicon systems.
 */
async function getCpuTopology(): Promise<CpuTopology | null> {
	if (os.platform() !== 'darwin') {
		return null;
	}

	try {
		const { stdout } = await execFileAsync('sysctl', [
			'hw.nperflevels',
			'hw.perflevel0.physicalcpu',
			'hw.perflevel1.physicalcpu',
			'machdep.cpu.brand_string',
		]);

		const nperfMatch = /hw\.nperflevels:\s*(\d+)/u.exec(stdout);
		if (!nperfMatch || Number(nperfMatch[1]) < 2) {
			return null;
		}

		const perfMatch = /hw\.perflevel0\.physicalcpu:\s*(\d+)/u.exec(stdout);
		const effMatch = /hw\.perflevel1\.physicalcpu:\s*(\d+)/u.exec(stdout);
		const modelMatch = /machdep\.cpu\.brand_string:\s*(.+)/u.exec(stdout);

		if (!perfMatch || !effMatch) {
			return null;
		}

		return {
			model: modelMatch?.[1]?.trim() ?? 'Apple Silicon',
			perfCores: Number(perfMatch[1]),
			effCores: Number(effMatch[1]),
		};
	} catch {
		return null;
	}
}

/**
 * Fetch CPU/GPU/SoC temperature via systeminformation.
 * Requires `macos-temperature-sensor` package on Apple Silicon.
 */
async function getTemperature(): Promise<TempData | undefined> {
	try {
		const temp = await si.cpuTemperature();
		const cpu =
			typeof temp.main === 'number' && temp.main > 0 ? temp.main : null;

		// systeminformation exposes Apple Silicon GPU/SoC temps when
		// macos-temperature-sensor is installed.
		const siAny = temp as unknown as Record<string, unknown>;
		const gpuDieTemps = siAny['gpuDieTemps'];
		const socTemps = siAny['socTemps'];

		let gpu: number | null = null;
		if (Array.isArray(gpuDieTemps) && gpuDieTemps.length > 0) {
			const nums = gpuDieTemps.filter(
				(v): v is number => typeof v === 'number' && v > 0,
			);
			gpu = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
		}

		let soc: number | null = null;
		if (Array.isArray(socTemps) && socTemps.length > 0) {
			const nums = socTemps.filter(
				(v): v is number => typeof v === 'number' && v > 0,
			);
			soc = nums.length > 0 ? nums.reduce((a, b) => a + b, 0) / nums.length : null;
		}

		if (cpu === null && gpu === null && soc === null) {
			return undefined;
		}

		return { cpu, gpu, soc };
	} catch {
		return undefined;
	}
}

/**
 * Fetch Apple Silicon GPU utilization via ioreg (no sudo required).
 */
async function getAppleGpuMetrics(): Promise<GpuState> {
	if (os.platform() !== 'darwin') {
		return {
			kind: 'unsupported',
			reason: '仅支持 macOS 系统',
		};
	}

	try {
		const { stdout } = await execFileAsync('ioreg', [
			'-r',
			'-c',
			'AGXAccelerator',
			'-d',
			'1',
		]);

		const deviceMatch = /"Device Utilization %"\s*=\s*(\d+)/u.exec(stdout);
		if (!deviceMatch) {
			return {
				kind: 'unsupported',
				reason: '未检测到 Apple Silicon GPU (AGXAccelerator)',
			};
		}

		const rendererMatch = /"Renderer Utilization %"\s*=\s*(\d+)/u.exec(
			stdout,
		);
		const tilerMatch = /"Tiler Utilization %"\s*=\s*(\d+)/u.exec(stdout);
		const memMatch = /"In use system memory"\s*=\s*(\d+)/u.exec(stdout);

		return {
			kind: 'ok',
			deviceUtilization: Number(deviceMatch[1]),
			rendererUtilization: Number(rendererMatch?.[1] ?? 0),
			tilerUtilization: Number(tilerMatch?.[1] ?? 0),
			inUseMemory: Number(memMatch?.[1] ?? 0),
		};
	} catch {
		return {
			kind: 'unsupported',
			reason: 'ioreg 命令执行失败，可能不支持当前硬件',
		};
	}
}

/** Prefer the volume that contains `process.cwd()`, then OS root volume, then largest. */
function pickDiskForDisplay(
	filesystems: FsSizeEntry[],
): FsSizeEntry | undefined {
	if (filesystems.length === 0) {
		return undefined;
	}

	const cwd = process.cwd();
	const isWin = os.platform() === 'win32';

	const sortedByMountLength = [...filesystems].sort(
		(a, b) => b.mount.length - a.mount.length,
	);

	for (const fs of sortedByMountLength) {
		if (isWin) {
			const m = fs.mount.replace(/\\$/u, '').toLowerCase();
			const c = cwd.toLowerCase();
			if (m.length > 0 && c.startsWith(m)) {
				return fs;
			}
		} else if (cwd === fs.mount || cwd.startsWith(`${fs.mount}/`)) {
			return fs;
		}
	}

	if (isWin) {
		const drive = process.env['SystemDrive'] ?? 'C:';
		const candidates = [drive, `${drive}\\`, `${drive}/`];
		const found = filesystems.find(f =>
			candidates.some(c => f.mount.toLowerCase() === c.toLowerCase()),
		);
		if (found) {
			return found;
		}
	} else if (os.platform() === 'darwin') {
		const dataVol = filesystems.find(f => f.mount === '/System/Volumes/Data');
		if (dataVol) {
			return dataVol;
		}

		const root = filesystems.find(f => f.mount === '/');
		if (root) {
			return root;
		}
	} else {
		const root = filesystems.find(f => f.mount === '/');
		if (root) {
			return root;
		}
	}

	let largest: FsSizeEntry = filesystems[0]!;
	for (const f of filesystems) {
		if (f.size > largest.size) {
			largest = f;
		}
	}

	return largest;
}

// ── Temperature label component ─────────────────────────────

function TempLabel({ temp }: { readonly temp: TempData }) {
	const parts: React.ReactNode[] = [];

	if (temp.cpu !== null) {
		parts.push(
			<Text key="cpu">
				CPU{' '}
				<Text color={tempColor(temp.cpu)}>{temp.cpu.toFixed(1)}°C</Text>
			</Text>,
		);
	}

	if (temp.gpu !== null) {
		parts.push(
			<Text key="gpu">
				GPU{' '}
				<Text color={tempColor(temp.gpu)}>{temp.gpu.toFixed(1)}°C</Text>
			</Text>,
		);
	}

	if (temp.soc !== null) {
		parts.push(
			<Text key="soc">
				SoC{' '}
				<Text color={tempColor(temp.soc)}>{temp.soc.toFixed(1)}°C</Text>
			</Text>,
		);
	}

	if (parts.length === 0) {
		return null;
	}

	return (
		<Text dimColor>
			{' 🌡️ '}
			{parts.map((p, i) => (
				<Text key={i}>
					{i > 0 ? ' | ' : ''}
					{p}
				</Text>
			))}
		</Text>
	);
}

// ── Main component ──────────────────────────────────────────

export default function PerformanceMonitor({ isActive }: Props) {
	const [metrics, setMetrics] = useState<MetricsState | undefined>(undefined);
	const topologyRef = useRef<CpuTopology | null | undefined>(undefined);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		let cancelled = false;

		// Fetch topology once
		const initTopology = async () => {
			if (topologyRef.current === undefined) {
				topologyRef.current = await getCpuTopology();
			}
		};

		const refresh = async () => {
			try {
				await initTopology();

				const [load, mem, filesystems, gpuResult, tempResult, fsStatsResult] =
					await Promise.all([
						si.currentLoad(),
						si.mem(),
						si.fsSize(),
						getAppleGpuMetrics(),
						getTemperature(),
						si.fsStats(),
					]);

				if (cancelled) {
					return;
				}

				const cpu = load.currentLoad;
				const cpuCores: CoreLoad[] = load.cpus.map(c => ({
					load: clampPercent(c.load),
				}));
				const disk = pickDiskForDisplay(filesystems);

				if (!disk || disk.size <= 0) {
					setMetrics({
						kind: 'error',
						message: '无法读取磁盘空间',
					});
					return;
				}

				const diskUsedPercent =
					typeof disk.use === 'number' && !Number.isNaN(disk.use)
						? clampPercent(disk.use)
						: clampPercent((disk.used / disk.size) * 100);

				setMetrics({
					kind: 'ok',
					cpu: clampPercent(cpu),
					cpuCores,
					cpuTopology: topologyRef.current ?? undefined,
					temp: tempResult,
					memTotal: mem.total,
					memActive: mem.active,
					memBuffcache: mem.buffcache,
					memAvailable: mem.available,
					swapUsed: mem.swapused,
					swapTotal: mem.swaptotal,
					diskMount: disk.mount,
					diskAvailable: disk.available,
					diskSize: disk.size,
					diskUsedPercent,
					...(typeof fsStatsResult.rx_sec === 'number'
						? {
								diskReadSpeed: fsStatsResult.rx_sec,
								diskWriteSpeed: fsStatsResult.wx_sec ?? 0,
							}
						: {}),
					gpu: gpuResult,
				});
			} catch (error: unknown) {
				if (!cancelled) {
					setMetrics({
						kind: 'error',
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		};

		void refresh();
		const id = setInterval(refresh, 1500);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [isActive]);

	const barWidth = 32;

	if (metrics?.kind === 'error') {
		return (
			<Box paddingX={2} flexDirection="column">
				<Text color="red">读取系统信息失败: {metrics.message}</Text>
			</Box>
		);
	}

	if (!metrics || metrics.kind !== 'ok') {
		return (
			<Box paddingX={2}>
				<Text dimColor>正在读取性能数据…</Text>
			</Box>
		);
	}

	// ── Compute memory pressure ─────────────────────────────
	const memPressurePercent =
		metrics.memTotal > 0
			? clampPercent((1 - metrics.memAvailable / metrics.memTotal) * 100)
			: 0;
	const appPercent =
		metrics.memTotal > 0
			? clampPercent((metrics.memActive / metrics.memTotal) * 100)
			: 0;
	const cachePercent =
		metrics.memTotal > 0
			? clampPercent((metrics.memBuffcache / metrics.memTotal) * 100)
			: 0;
	const swapPercent =
		metrics.swapTotal > 0
			? clampPercent((metrics.swapUsed / metrics.swapTotal) * 100)
			: 0;

	const pressureLabel =
		memPressurePercent < 50
			? '🟢 压力正常'
			: memPressurePercent < 75
				? '🟡 压力偏高'
				: '🔴 压力严重';
	const pressureColor: 'green' | 'yellow' | 'red' =
		memPressurePercent < 50
			? 'green'
			: memPressurePercent < 75
				? 'yellow'
				: 'red';

	// ── Compute P/E core averages ───────────────────────────
	const topo = metrics.cpuTopology;
	let perfAvg: number | undefined;
	let effAvg: number | undefined;

	if (topo && metrics.cpuCores.length >= topo.perfCores + topo.effCores) {
		const perfCores = metrics.cpuCores.slice(0, topo.perfCores);
		const effCores = metrics.cpuCores.slice(
			topo.perfCores,
			topo.perfCores + topo.effCores,
		);

		perfAvg =
			perfCores.reduce((sum, c) => sum + c.load, 0) / perfCores.length;
		effAvg = effCores.reduce((sum, c) => sum + c.load, 0) / effCores.length;
	}

	return (
		<Box paddingX={2} flexDirection="column">
			{/* ── CPU section ─────────────────────────────────── */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					CPU{topo ? ` ${topo.model}` : ''}
					{metrics.temp ? <TempLabel temp={metrics.temp} /> : ''}
				</Text>
				<Text>
					{' 总计    '}
					<ProgressBar percent={metrics.cpu} width={barWidth} />
				</Text>
				{perfAvg !== undefined && topo ? (
					<Text>
						{` P核 (${topo.perfCores}) `}
						<ProgressBar percent={perfAvg} width={barWidth} />
					</Text>
				) : null}
				{effAvg !== undefined && topo ? (
					<Text>
						{` E核 (${topo.effCores}) `}
						<ProgressBar percent={effAvg} width={barWidth} />
					</Text>
				) : null}
			</Box>

			{/* ── GPU section ─────────────────────────────────── */}
			{metrics.gpu.kind === 'ok' ? (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold>
						GPU (Apple Silicon)
						{metrics.gpu.inUseMemory > 0 ? (
							<Text dimColor>
								{' '}
								显存 {formatBytes(metrics.gpu.inUseMemory)}
							</Text>
						) : (
							''
						)}
					</Text>
					<Text>
						{' 总计 '}
						<ProgressBar
							percent={metrics.gpu.deviceUtilization}
							width={barWidth}
						/>
					</Text>
					<Text>
						{' 渲染 '}
						<ProgressBar
							percent={metrics.gpu.rendererUtilization}
							width={barWidth}
						/>
					</Text>
					<Text>
						{' 平铺 '}
						<ProgressBar
							percent={metrics.gpu.tilerUtilization}
							width={barWidth}
						/>
					</Text>
				</Box>
			) : (
				<Box flexDirection="column" marginBottom={1}>
					<Text bold>GPU</Text>
					<Text dimColor>⚠ 不支持获取 GPU 利用率: {metrics.gpu.reason}</Text>
				</Box>
			)}

			{/* ── Memory section ──────────────────────────────── */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					内存 {formatBytes(metrics.memTotal)}{' '}
					<Text color={pressureColor}>{pressureLabel}</Text>
				</Text>
				<Text>
					{' 应用 '}
					<ProgressBar percent={appPercent} width={barWidth} />
					<Text dimColor> {formatBytes(metrics.memActive)}</Text>
				</Text>
				<Text>
					{' 缓存 '}
					<ProgressBar percent={cachePercent} width={barWidth} />
					<Text dimColor> {formatBytes(metrics.memBuffcache)}</Text>
				</Text>
				{metrics.swapUsed > 0 ? (
					<Text>
						{' Swap '}
						<ProgressBar percent={swapPercent} width={barWidth} />
						<Text dimColor>
							{' '}
							{formatBytes(metrics.swapUsed)} / {formatBytes(metrics.swapTotal)}
							{swapPercent >= 50 ? ' ⚠️' : ''}
						</Text>
					</Text>
				) : null}
			</Box>

			{/* ── Disk section ────────────────────────────────── */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					{`磁盘 (${metrics.diskMount}) 剩余 ${formatBytes(
						metrics.diskAvailable,
					)} / 共 ${formatBytes(metrics.diskSize)}`}
				</Text>
				{metrics.diskReadSpeed !== undefined ? (
					<Text dimColor>
						{`  ↓ ${formatSpeed(metrics.diskReadSpeed)}  ↑ ${formatSpeed(metrics.diskWriteSpeed ?? 0)}`}
					</Text>
				) : null}
				<ProgressBar percent={metrics.diskUsedPercent} width={barWidth} />
			</Box>
			<Text dimColor>约每 1.5 秒刷新</Text>
		</Box>
	);
}
