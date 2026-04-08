import os from 'node:os';
import process from 'node:process';
import React, {useEffect, useState} from 'react';
import {Box, Text} from 'ink';
import si from 'systeminformation';

type FsSizeEntry = Awaited<ReturnType<typeof si.fsSize>>[number];

type Props = {
	readonly isActive: boolean;
};

type MetricsState =
	| {
			kind: 'ok';
			cpu: number;
			memUsed: number;
			memTotal: number;
			diskMount: string;
			diskAvailable: number;
			diskSize: number;
			diskUsedPercent: number;
	  }
	| {
			kind: 'error';
			message: string;
	  };

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

export default function PerformanceMonitor({isActive}: Props) {
	const [metrics, setMetrics] = useState<MetricsState | undefined>(undefined);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		let cancelled = false;

		const refresh = async () => {
			try {
				const [load, mem, filesystems] = await Promise.all([
					si.currentLoad(),
					si.mem(),
					si.fsSize(),
				]);

				if (cancelled) {
					return;
				}

				const cpu = load.currentLoad;
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
					memUsed: mem.used,
					memTotal: mem.total,
					diskMount: disk.mount,
					diskAvailable: disk.available,
					diskSize: disk.size,
					diskUsedPercent,
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

	const memPercent =
		metrics.memTotal > 0 ? (metrics.memUsed / metrics.memTotal) * 100 : 0;

	return (
		<Box paddingX={2} flexDirection="column">
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>CPU</Text>
				<ProgressBar percent={metrics.cpu} width={barWidth} />
			</Box>
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					内存 {formatBytes(metrics.memUsed)} / {formatBytes(metrics.memTotal)}
				</Text>
				<ProgressBar percent={memPercent} width={barWidth} />
			</Box>
			<Box flexDirection="column" marginBottom={1}>
				<Text bold>
					{`磁盘 (${metrics.diskMount}) 剩余 ${formatBytes(
						metrics.diskAvailable,
					)} / 共 ${formatBytes(metrics.diskSize)}`}
				</Text>
				<ProgressBar percent={metrics.diskUsedPercent} width={barWidth} />
			</Box>
			<Text dimColor>约每 1.5 秒刷新</Text>
		</Box>
	);
}
