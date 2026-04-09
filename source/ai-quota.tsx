import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import http from 'node:http';
import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const execAsync = promisify(exec);

const PREFS_FILE = path.join(os.homedir(), '.dev_dashboard_ai_quota.json');

type Prefs = {
	hiddenProviders: string[];
	hiddenModels: string[];
};

function loadPrefs(): Prefs {
	try {
		const data = fs.readFileSync(PREFS_FILE, 'utf-8');
		return JSON.parse(data);
	} catch {
		return { hiddenProviders: [], hiddenModels: [] };
	}
}

function savePrefs(prefs: Prefs) {
	try {
		fs.writeFileSync(PREFS_FILE, JSON.stringify(prefs, null, 2));
	} catch {}
}

type Props = {
	readonly isActive: boolean;
	readonly onFormModeChange?: (inForm: boolean) => void;
};

type QuotaInfo = {
	remainingFraction?: number;
	resetTime?: string;
	totalAmount?: number;
	remainingAmount?: number;
};

type UsageInfo = {
	inputTokens: number;
	outputTokens: number;
	totalTokens: number;
};

type ModelQuota = {
	id: string;
	displayName?: string;
	model: string;
	quotaInfo?: QuotaInfo;
	usageInfo?: UsageInfo;
};

type AccountQuota = {
	email: string;
	models: ModelQuota[];
};

type ProviderInfo = {
	id: string;
	name: string;
	accounts: AccountQuota[];
};

function clampPercent(n: number): number {
	return Math.min(100, Math.max(0, n));
}

function barColor(percent: number): 'green' | 'yellow' | 'red' {
	if (percent > 60) return 'green';
	if (percent > 20) return 'yellow';
	return 'red';
}

function ProgressBar({ percent, width }: { percent: number; width: number }) {
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

function fetchUserStatus(port: number, token: string): Promise<any> {
	return new Promise((resolve, reject) => {
		const bodyData = JSON.stringify({ metadata: { ideName: 'antigravity', extensionName: 'antigravity', locale: 'en' } });
		const req = http.request({
			hostname: '127.0.0.1',
			port,
			path: '/exa.language_server_pb.LanguageServerService/GetUserStatus',
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Content-Length': Buffer.byteLength(bodyData),
				'Connect-Protocol-Version': '1',
				'X-Codeium-Csrf-Token': token,
			},
			timeout: 2000,
		}, (res) => {
			let body = '';
			res.on('data', c => { body += c; });
			res.on('end', () => {
				if (res.statusCode === 200) {
					try { resolve(JSON.parse(body)); } catch (e) { reject(new Error("Parse error")); }
				} else {
					reject(new Error(`Status ${res.statusCode}`));
				}
			});
		});
		req.on('error', reject);
		req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
		req.write(bodyData);
		req.end();
	});
}

async function fetchAntigravity(): Promise<ProviderInfo | null> {
	try {
		const { stdout } = await execAsync("ps -ww -eo pid,args | grep -E 'language_server' | grep -v grep").catch(() => ({ stdout: '' }));
		
		if (!stdout || !stdout.trim()) {
			return null;
		}

		const lines = stdout.trim().split('\n');

		for (const line of lines) {
			const tokenMatch = line.match(/--csrf_token[=\s]+([a-zA-Z0-9-]+)/i);
			if (!tokenMatch) continue;
			
			const csrfToken = tokenMatch[1]!;
			const parts = line.trim().split(/\s+/);
			const pid = parts[0];

			let ports: number[] = [];
			try {
				const { stdout: lsofOut } = await execAsync(`lsof -nP -a -iTCP -sTCP:LISTEN -p ${pid} 2>/dev/null || true`);
				const lsofLines = lsofOut.split('\n');
				for (const lsofLine of lsofLines) {
					if (lsofLine.includes('(LISTEN)')) {
						const portMatch = lsofLine.match(/[*\d.:]+:(\d+)\s+\(LISTEN\)/);
						if (portMatch && portMatch[1]) ports.push(parseInt(portMatch[1]!, 10));
					}
				}
			} catch (e) {}

			if (ports.length === 0) {
				const portMatch = line.match(/--extension_server_port[=\s]+(\d+)/);
				if (portMatch && portMatch[1]) ports.push(parseInt(portMatch[1]!, 10));
			}

			for (const port of ports) {
				try {
					const response = await fetchUserStatus(port, csrfToken);
					if (response && response.userStatus) {
						const userStatus = response.userStatus;
						const email = userStatus.email || "Local Context";
						
						const configs = userStatus.cascadeModelConfigData?.clientModelConfigs || [];
						const models: ModelQuota[] = configs.map((c: any) => ({
							id: c.modelOrAlias?.model || c.label,
							displayName: c.label,
							model: c.modelOrAlias?.model,
							quotaInfo: c.quotaInfo
						}));

						models.sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));

						return {
							id: 'antigravity',
							name: 'Google AntiGravity',
							accounts: [{ email, models }]
						}; 
					}
				} catch (e) {}
			}
		}

		return null;
	} catch (err: any) {
		return null;
	}
}

async function fetchCursorQuotas(): Promise<ProviderInfo | null> {
	try {
		const dbPath = path.join(os.homedir(), 'Library/Application Support/Cursor/User/globalStorage/state.vscdb');
		let accessToken = '';
		let cachedEmail = '';
		try {
			accessToken = await execAsync(`sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = 'cursorAuth/accessToken'"`, { encoding: 'utf-8' }).then(res => res.stdout.trim());
			cachedEmail = await execAsync(`sqlite3 "${dbPath}" "SELECT value FROM ItemTable WHERE key = 'cursorAuth/cachedEmail'"`, { encoding: 'utf-8' }).then(res => res.stdout.trim()).catch(() => '');
		} catch (e) {
			return null;
		}

		if (!accessToken) return null;

		// Decode JWT to extract userId from the 'sub' claim
		// JWT format: header.payload.signature (all base64url encoded)
		let userId = '';
		try {
			const parts = accessToken.split('.');
			if (parts.length >= 2) {
				// Decode the payload (2nd part), handle base64url → base64
				let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
				while (payload.length % 4) payload += '=';
				const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
				// sub looks like "google-oauth2|user_01KG4A7XXY2KPGP4RV5GPGSE4P"
				if (decoded.sub) {
					const subParts = decoded.sub.split('|');
					userId = subParts.length > 1 ? subParts[1] : decoded.sub;
				}
			}
		} catch (e) {}

		if (!userId) return null;

		// Construct the proper WorkosCursorSessionToken: userId%3A%3AaccessToken
		const sessionToken = `${userId}%3A%3A${accessToken}`;

		// Fetch usage summary via GET
		const summaryText = await new Promise<string>((resolve) => {
			const url = new URL('https://cursor.com/api/usage-summary');
			const req = https.request(url, {
				method: 'GET',
				headers: { 'Cookie': `WorkosCursorSessionToken=${sessionToken}`, 'User-Agent': 'Mozilla/5.0' },
				timeout: 5000
			}, (res: any) => {
				let body = '';
				res.on('data', (c: any) => { body += c; });
				res.on('end', () => resolve(res.statusCode === 200 ? body : '{}'));
			});
			req.on('error', () => resolve('{}'));
			req.on('timeout', () => { req.destroy(); resolve('{}'); });
			req.end();
		});

		try {
			const summaryData = JSON.parse(summaryText);
			const models: ModelQuota[] = [];

			if (summaryData?.individualUsage?.plan) {
				const plan = summaryData.individualUsage.plan;

				if (plan.autoPercentUsed !== undefined) {
					models.push({
						id: 'cursor-auto',
						displayName: `自动额度 (${summaryData.membershipType === 'pro' ? 'Pro' : 'Free'})`,
						model: 'auto',
						quotaInfo: {
							remainingFraction: Math.max(0, 1 - plan.autoPercentUsed / 100),
							resetTime: summaryData.billingCycleEnd
						}
					});
				}

				if (plan.apiPercentUsed !== undefined) {
					models.push({
						id: 'cursor-api',
						displayName: `API额度 (${summaryData.membershipType === 'pro' ? 'Pro' : 'Free'})`,
						model: 'api',
						quotaInfo: {
							remainingFraction: Math.max(0, 1 - plan.apiPercentUsed / 100),
							resetTime: summaryData.billingCycleEnd
						}
					});
				}
			}

			if (models.length === 0) {
				return {
					id: 'cursor',
					name: 'Cursor Editor',
					accounts: [{ email: cachedEmail || 'No Usage', models: [] }]
				};
			}

			models.sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));

			return {
				id: 'cursor',
				name: 'Cursor Editor',
				accounts: [{ email: cachedEmail || 'Cursor Account', models }]
			};
		} catch (e: any) {
			return {
				id: 'cursor',
				name: 'Cursor Editor',
				accounts: [{ email: 'API Error: ' + e.message, models: [] }]
			};
		}

	} catch (e: any) {
		return null;
	}
}

async function detectSocksProxy(): Promise<string | null> {
	try {
		const { stdout } = await execAsync('scutil --proxy 2>/dev/null').catch(() => ({ stdout: '' }));
		if (!stdout) return null;
		const enableMatch = stdout.match(/SOCKSEnable\s*:\s*(\d+)/);
		if (!enableMatch || enableMatch[1] !== '1') return null;
		const hostMatch = stdout.match(/SOCKSProxy\s*:\s*(\S+)/);
		const portMatch = stdout.match(/SOCKSPort\s*:\s*(\d+)/);
		if (hostMatch && portMatch) {
			return `${hostMatch[1]}:${portMatch[1]}`;
		}
		return null;
	} catch {
		return null;
	}
}

async function fetchCodexQuotas(): Promise<ProviderInfo | null> {
	try {
		const models: ModelQuota[] = [];
		let codexAccountEmail = 'Codex Local';

		try {
			const authPath = path.join(os.homedir(), '.codex', 'auth.json');
			if (fs.existsSync(authPath)) {
				const authData = JSON.parse(fs.readFileSync(authPath, 'utf-8'));
				if (authData?.tokens?.access_token) {
					const accessToken = authData.tokens.access_token;
					const accountId = authData.tokens.account_id || '';
					
					// Decode email from JWT if possible
					try {
						const parts = authData.tokens.id_token.split('.');
						if (parts.length >= 2) {
							let payload = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
							while (payload.length % 4) payload += '=';
							const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf-8'));
							if (decoded.email) codexAccountEmail = decoded.email;
						}
					} catch (e) {}
					
					// Detect system SOCKS proxy for environments where chatgpt.com is not directly reachable
					const socksProxy = await detectSocksProxy();
					const proxyArg = socksProxy ? `--socks5-hostname ${socksProxy}` : '';
					
					const curlHeaders = [
						`-H "Authorization: Bearer ${accessToken}"`,
						`-H "Accept: application/json"`,
						`-H "User-Agent: Mozilla/5.0"`,
						...(accountId ? [`-H "ChatGPT-Account-Id: ${accountId}"`] : [])
					].join(' ');
					
					const { stdout: usageText } = await execAsync(
						`curl -s --max-time 8 ${proxyArg} ${curlHeaders} "https://chatgpt.com/backend-api/wham/usage"`,
						{ encoding: 'utf-8' }
					).catch(() => ({ stdout: '{}' }));

					const usageData = JSON.parse(usageText || '{}');
					const planType = usageData.plan_type || 'Plus';
					
					// Primary rate limit window (5-hour)
					const primaryWindow = usageData?.rate_limit?.primary_window;
					if (primaryWindow && primaryWindow.used_percent !== undefined) {
						let resetTimeStr: string | undefined = undefined;
						if (primaryWindow.reset_at) {
							resetTimeStr = new Date(primaryWindow.reset_at * 1000).toISOString();
						} else if (primaryWindow.reset_after_seconds !== undefined) {
							resetTimeStr = new Date(Date.now() + primaryWindow.reset_after_seconds * 1000).toISOString();
						}
						
						const windowHours = primaryWindow.limit_window_seconds
							? Math.round(primaryWindow.limit_window_seconds / 3600)
							: 5;
						
						models.push({
							id: 'codex-primary',
							displayName: `Codex 额度 (${planType}, ${windowHours}h窗口)`,
							model: 'codex',
							quotaInfo: {
								remainingFraction: Math.max(0, 1 - primaryWindow.used_percent / 100),
								resetTime: resetTimeStr
							}
						});
					}

					// Secondary rate limit window (weekly)
					const secondaryWindow = usageData?.rate_limit?.secondary_window;
					if (secondaryWindow && secondaryWindow.used_percent !== undefined) {
						let resetTimeStr: string | undefined = undefined;
						if (secondaryWindow.reset_at) {
							resetTimeStr = new Date(secondaryWindow.reset_at * 1000).toISOString();
						} else if (secondaryWindow.reset_after_seconds !== undefined) {
							resetTimeStr = new Date(Date.now() + secondaryWindow.reset_after_seconds * 1000).toISOString();
						}
						
						const windowDays = secondaryWindow.limit_window_seconds
							? Math.round(secondaryWindow.limit_window_seconds / 86400)
							: 7;
						
						models.push({
							id: 'codex-secondary',
							displayName: `Codex 额度 (${planType}, ${windowDays}d窗口)`,
							model: 'codex',
							quotaInfo: {
								remainingFraction: Math.max(0, 1 - secondaryWindow.used_percent / 100),
								resetTime: resetTimeStr
							}
						});
					}

					// Code review rate limit
					const codeReviewWindow = usageData?.code_review_rate_limit?.primary_window;
					if (codeReviewWindow && codeReviewWindow.used_percent !== undefined) {
						let resetTimeStr: string | undefined = undefined;
						if (codeReviewWindow.reset_at) {
							resetTimeStr = new Date(codeReviewWindow.reset_at * 1000).toISOString();
						} else if (codeReviewWindow.reset_after_seconds !== undefined) {
							resetTimeStr = new Date(Date.now() + codeReviewWindow.reset_after_seconds * 1000).toISOString();
						}
						
						models.push({
							id: 'codex-code-review',
							displayName: `Code Review 额度 (${planType})`,
							model: 'codex-code-review',
							quotaInfo: {
								remainingFraction: Math.max(0, 1 - codeReviewWindow.used_percent / 100),
								resetTime: resetTimeStr
							}
						});
					}
				}
			}
		} catch(e) {}

		if (models.length === 0) return null;

		models.sort((a, b) => (a.displayName || a.id).localeCompare(b.displayName || b.id));

		return {
			id: 'codex',
			name: 'OpenAI Codex',
			accounts: [{ email: codexAccountEmail, models }]
		};
	} catch(e) {
		return null;
	}
}

export default function AiQuotaTab({ isActive, onFormModeChange }: Props) {
	const [providers, setProviders] = useState<ProviderInfo[]>([]);
	const [error, setError] = useState<string | null>(null);
	const [status, setStatus] = useState<string>("正在扫描...");

	const [isEditing, setIsEditing] = useState(false);
	const [cursorIdx, setCursorIdx] = useState(0);
	const [prefs, setPrefs] = useState<Prefs>(loadPrefs());

	// Handle Edit Mode Toggle
	useEffect(() => {
		if (onFormModeChange) {
			onFormModeChange(isEditing);
		}
	}, [isEditing, onFormModeChange]);

	useEffect(() => {
		if (!isActive) {
			if (isEditing) setIsEditing(false);
			return;
		}

		let cancelled = false;
		const fetchAll = async () => {
			try {
				const results: ProviderInfo[] = [];

				const antigravity = await fetchAntigravity();
				if (antigravity) results.push(antigravity);

				const codex = await fetchCodexQuotas();
				if (codex) results.push(codex);

				const cursor = await fetchCursorQuotas();
				if (cursor) results.push(cursor);

				if (!cancelled) {
					setProviders(results);
					if (results.length > 0) {
						setError(null);
						setStatus("已连接");
					} else {
						setError("未检测到运行中的进程或代理。");
					}
				}
			} catch (err: any) {
				if (!cancelled) setError(err.message || String(err));
			}
		};

		void fetchAll();
		const interval = setInterval(() => {
			if (!isEditing) fetchAll(); // Don't refresh data while editing to avoid cursor jumping
		}, 5000);
		return () => {
			cancelled = true;
			clearInterval(interval);
		};
	}, [isActive, isEditing]);

	// Build rows for editor & display
	type Row = 
		| { type: 'provider', id: string, name: string }
		| { type: 'model', id: string, name: string, providerId: string, modelObj?: ModelQuota };

	const rows: Row[] = [];
	for (const p of providers) {
		rows.push({ type: 'provider', id: p.id, name: p.name });
		for (const account of p.accounts) {
			for (const model of account.models) {
				const uniqueModelId = `${p.id}::${account.email}::${model.id}`;
				let modelName = model.displayName || model.id;
				if (account.email && account.email !== 'Local Context' && account.email !== 'Codex CLI Local') {
					modelName += ` (${account.email})`;
				}
				rows.push({ type: 'model', id: uniqueModelId, name: modelName, providerId: p.id, modelObj: model });
			}
		}
	}

	const toggleItem = (row: Row) => {
		const next = { ...prefs };
		if (row.type === 'provider') {
			if (next.hiddenProviders.includes(row.id)) {
				next.hiddenProviders = next.hiddenProviders.filter(x => x !== row.id);
			} else {
				next.hiddenProviders.push(row.id);
			}
		} else {
			if (next.hiddenModels.includes(row.id)) {
				next.hiddenModels = next.hiddenModels.filter(x => x !== row.id);
			} else {
				next.hiddenModels.push(row.id);
			}
		}
		setPrefs(next);
		savePrefs(next);
	};

	useInput((input, key) => {
		if (!isActive) return;

		if (key.escape || input.toLowerCase() === 'e') {
			setIsEditing(prev => !prev);
			setCursorIdx(0);
			return;
		}

		if (isEditing) {
			if (key.upArrow) {
				setCursorIdx(Math.max(0, cursorIdx - 1));
			} else if (key.downArrow) {
				setCursorIdx(Math.min(rows.length - 1, cursorIdx + 1));
			} else if (input === ' ' || key.return) {
				const row = rows[cursorIdx];
				if (row) toggleItem(row);
			}
		}
	});

	if (error && !isEditing && providers.length === 0) {
		return (
			<Box paddingX={2} flexDirection="column">
				<Text color="red">❌ {error}</Text>
				<Text dimColor>稍后将自动重试...</Text>
			</Box>
		);
	}

	if (providers.length === 0 && !isEditing) {
		return (
			<Box paddingX={2}>
				<Text dimColor>⏳ {status}</Text>
			</Box>
		);
	}

	if (isEditing) {
		return (
			<Box paddingX={2} flexDirection="column">
				<Box marginBottom={1}>
					<Text bold color="yellow">✏️ 编辑可见性 (空格: 切换, E/ESC: 退出)</Text>
				</Box>
				{rows.map((row, idx) => {
					const isFocused = idx === cursorIdx;
					const isHidden = row.type === 'provider' 
						? prefs.hiddenProviders.includes(row.id)
						: prefs.hiddenModels.includes(row.id);
					
					const prefix = isFocused ? '> ' : '  ';
					const check = isHidden ? '[ ]' : '[x]';
					const indent = row.type === 'model' ? '  ' : '';
					
					return (
						<Text key={row.id} color={isFocused ? 'cyan' : undefined} dimColor={isHidden}>
							{prefix}{indent}{check} {row.name}
						</Text>
					);
				})}
			</Box>
		);
	}

	return (
		<Box paddingX={2} flexDirection="column">
			<Box marginBottom={1}>
				<Text dimColor>💡 按 </Text>
				<Text bold color="yellow">e</Text>
				<Text dimColor> 键配置工具及模型的展示与隐藏</Text>
			</Box>

			{providers.map(p => {
				if (prefs.hiddenProviders.includes(p.id)) return null;

				return (
					<Box key={p.id} flexDirection="column" marginBottom={1}>
						<Text bold color="cyan">🤖 {p.name}</Text>
						
						{p.accounts.map(acc => {
							if (acc.models.length === 0) {
								return (
									<Box key={`${p.id}::${acc.email}`} marginLeft={2} marginBottom={1}>
										<Text dimColor>{acc.email}</Text>
									</Box>
								);
							}
							return acc.models.map(model => {
								const uniqueModelId = `${p.id}::${acc.email}::${model.id}`;
								if (prefs.hiddenModels.includes(uniqueModelId)) return null;

								let name = model.displayName || model.id;
								if (acc.email && acc.email !== 'Local Context' && acc.email !== 'Codex CLI Local') {
									name += ` (${acc.email})`;
								}

								return (
									<Box key={uniqueModelId} flexDirection="column" marginLeft={2} marginBottom={1}>
										<Text bold>{name}</Text>
										
										{model.quotaInfo && (
											<>
												<Box>
													<Text>{'剩余 '} </Text>
													<ProgressBar percent={(model.quotaInfo.remainingFraction ?? 1) * 100} width={30} />
													{model.quotaInfo.remainingAmount !== undefined && model.quotaInfo.totalAmount !== undefined && (
														<Text dimColor> ({model.quotaInfo.remainingAmount}/{model.quotaInfo.totalAmount})</Text>
													)}
												</Box>
												{model.quotaInfo.resetTime && (
													<Text dimColor>重置时间: {new Date(model.quotaInfo.resetTime).toLocaleString()}</Text>
												)}
											</>
										)}

										{model.usageInfo && (
											<Box flexDirection="column">
												<Text dimColor>今日消耗:</Text>
												<Text>
													⬆️ Input: {model.usageInfo.inputTokens}{'  '}
													⬇️ Output: {model.usageInfo.outputTokens}
												</Text>
												<Text bold color="cyan">🚀 Total: {model.usageInfo.totalTokens}</Text>
											</Box>
										)}
									</Box>
								);
							});
						})}
					</Box>
				);
			})}
		</Box>
	);
}
