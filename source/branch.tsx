import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { execSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { type Branch, type StoreData } from './types.js';
import { loadData, saveData, generateId, getProjectRepos } from './store.js';

type BranchMode = 'list' | 'action' | 'add' | 'deleteGitPrompt';
type AddStep =
	| 'choose'
	| 'dirPrompt'
	| 'repoInput'
	| 'repoSelect'
	| 'branchInput'
	| 'descInput'
	| 'gitPrompt';

type Props = {
	isActive: boolean;
	onFormModeChange: (inForm: boolean) => void;
};

export default function BranchList({ isActive, onFormModeChange }: Props) {
	const [storeData, setStoreData] = useState<StoreData | null>(null);
	const [branches, setBranches] = useState<Branch[]>([]);
	const [mode, setMode] = useState<BranchMode>('list');
	const [selectedIndex, setSelectedIndex] = useState(0);

	// Add form state
	const [addStep, setAddStep] = useState<AddStep>('choose');
	const [formDir, setFormDir] = useState('');
	const [formRepo, setFormRepo] = useState('');
	const [formBranch, setFormBranch] = useState('');
	const [formDesc, setFormDesc] = useState('');
	const [repos, setRepos] = useState<string[]>([]);
	const [repoSelectIndex, setRepoSelectIndex] = useState(0);

	const VISIBLE_COUNT = 14;
	const [visibleStart, setVisibleStart] = useState(0);
	const [repoVisibleStart, setRepoVisibleStart] = useState(0);

	useEffect(() => {
		if (selectedIndex < visibleStart) setVisibleStart(selectedIndex);
		else if (selectedIndex >= visibleStart + VISIBLE_COUNT) setVisibleStart(selectedIndex - VISIBLE_COUNT + 1);
	}, [selectedIndex, visibleStart]);

	useEffect(() => {
		if (repoSelectIndex < repoVisibleStart) setRepoVisibleStart(repoSelectIndex);
		else if (repoSelectIndex >= repoVisibleStart + VISIBLE_COUNT) setRepoVisibleStart(repoSelectIndex - VISIBLE_COUNT + 1);
	}, [repoSelectIndex, repoVisibleStart]);

	useEffect(() => {
		const data = loadData();
		setStoreData(data);
		setBranches(data.branches);
	}, []);

	useEffect(() => {
		onFormModeChange(mode === 'add');
	}, [mode, onFormModeChange]);

	const persistBranches = (newBranches: Branch[]) => {
		setBranches(newBranches);
		if (storeData) {
			const newData = { ...storeData, branches: newBranches };
			setStoreData(newData);
			saveData(newData);
		}
	};

	const persistProjectDir = (dir: string) => {
		if (storeData) {
			const newData = { ...storeData, projectDir: dir };
			setStoreData(newData);
			saveData(newData);
		}
	};

	const loadReposFromDir = (dir: string) => {
		const projectRepos = getProjectRepos(dir);
		setRepos(projectRepos);
		setRepoSelectIndex(0);
		setAddStep('repoSelect');
	};

	const enterAddMode = () => {
		setFormRepo('');
		setFormBranch('');
		setFormDesc('');
		setFormDir('');
		setAddStep('choose');
		setMode('add');
	};

	const cancelAdd = () => {
		setMode('list');
	};

	const finishAdd = () => {
		if (formRepo.trim() && formBranch.trim()) {
			const newBranch: Branch = {
				id: generateId(),
				repo: formRepo.trim(),
				branch: formBranch.trim(),
				description: formDesc.trim(),
			};
			persistBranches([...branches, newBranch]);

			if (storeData?.projectDir) {
				setAddStep('gitPrompt');
				return;
			}
		}

		setMode('list');
	};

	// List navigation
	useInput(
		(input, key) => {
			if (key.upArrow) {
				setSelectedIndex(i => Math.max(0, i - 1));
			} else if (key.downArrow) {
				setSelectedIndex(i => Math.min(branches.length - 1, i + 1));
			} else if (key.return && branches.length > 0) {
				setMode('action');
			} else if (input === 'a') {
				enterAddMode();
			}
		},
		{ isActive: isActive && mode === 'list' },
	);

	// Action mode
	useInput(
		(input, key) => {
			if (key.escape) {
				setMode('list');
				return;
			}

			if (input === 'd') {
				if (storeData?.projectDir) {
					setMode('deleteGitPrompt');
				} else {
					const newBranches = branches.filter((_, i) => i !== selectedIndex);
					persistBranches(newBranches);
					setSelectedIndex(i => Math.max(0, Math.min(i, newBranches.length - 1)));
					setMode('list');
				}
			}
		},
		{ isActive: isActive && mode === 'action' },
	);

	// Delete Git Prompt mode
	useInput(
		(input, key) => {
			if (key.escape) {
				setMode('list');
				return;
			}

			const doDeleteRecord = () => {
				const newBranches = branches.filter((_, i) => i !== selectedIndex);
				persistBranches(newBranches);
				setSelectedIndex(i => Math.max(0, Math.min(i, newBranches.length - 1)));
				setMode('list');
			};

			if (input.toLowerCase() === 'y') {
				const selectedBranch = branches[selectedIndex];
				if (selectedBranch && storeData?.projectDir) {
					try {
						const fullPath = storeData.projectDir.startsWith('~')
							? path.join(os.homedir(), storeData.projectDir.slice(1))
							: storeData.projectDir;
						const repoPath = path.join(fullPath, selectedBranch.repo);
						execSync(`git branch -D ${selectedBranch.branch}`, { cwd: repoPath, stdio: 'ignore' });
					} catch { }
				}
				doDeleteRecord();
			} else if (input.toLowerCase() === 'n') {
				doDeleteRecord();
			}
		},
		{ isActive: isActive && mode === 'deleteGitPrompt' },
	);

	// Add mode - choose step
	useInput(
		(input, key) => {
			if (key.escape) {
				cancelAdd();
				return;
			}

			if (input === '1') {
				setAddStep('repoInput');
			} else if (input === '2') {
				if (storeData?.projectDir) {
					loadReposFromDir(storeData.projectDir);
				} else {
					setAddStep('dirPrompt');
				}
			}
		},
		{ isActive: isActive && mode === 'add' && addStep === 'choose' },
	);

	// Add mode - repo select
	useInput(
		(_input, key) => {
			if (key.escape) {
				cancelAdd();
				return;
			}

			if (key.upArrow) {
				setRepoSelectIndex(i => Math.max(0, i - 1));
			} else if (key.downArrow) {
				setRepoSelectIndex(i => Math.min(repos.length - 1, i + 1));
			} else if (key.return && repos.length > 0) {
				setFormRepo(repos[repoSelectIndex]!);
				setAddStep('branchInput');
			}
		},
		{ isActive: isActive && mode === 'add' && addStep === 'repoSelect' },
	);

	// Add mode - escape for text input steps
	useInput(
		(_input, key) => {
			if (key.escape) {
				cancelAdd();
			}
		},
		{
			isActive:
				isActive &&
				mode === 'add' &&
				(addStep === 'dirPrompt' ||
					addStep === 'repoInput' ||
					addStep === 'branchInput' ||
					addStep === 'descInput'),
		},
	);

	// Add mode - git prompt
	useInput(
		(input, key) => {
			if (key.escape) {
				setMode('list');
				return;
			}

			if (input.toLowerCase() === 'y') {
				if (storeData?.projectDir) {
					try {
						const fullPath = storeData.projectDir.startsWith('~')
							? path.join(os.homedir(), storeData.projectDir.slice(1))
							: storeData.projectDir;
						const repoPath = path.join(fullPath, formRepo.trim());
						execSync(`git checkout -b ${formBranch.trim()}`, { cwd: repoPath, stdio: 'ignore' });
					} catch { }
				}
				setMode('list');
			} else if (input.toLowerCase() === 'n') {
				setMode('list');
			}
		},
		{ isActive: isActive && mode === 'add' && addStep === 'gitPrompt' },
	);

	// ---------- RENDER ----------

	if (mode === 'add') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						📝 新增分支
					</Text>
				</Box>

				{addStep === 'choose' && (
					<Box flexDirection="column">
						<Text>选择仓库名输入方式:</Text>
						<Box marginTop={1} flexDirection="column">
							<Text color="cyan">[1] 手动输入仓库名</Text>
							<Text color="cyan">
								[2] 从本地目录选择
								{storeData?.projectDir ? ` (${storeData.projectDir})` : ''}
							</Text>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>按 1 或 2 选择 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'dirPrompt' && (
					<Box flexDirection="column">
						<Box>
							<Text color="cyan">请输入包含有项目仓库的父目录路径: </Text>
							<TextInput
								value={formDir}
								onChange={setFormDir}
								onSubmit={val => {
									if (val.trim()) {
										persistProjectDir(val.trim());
										loadReposFromDir(val.trim());
									}
								}}
							/>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>例如: ~/project 或者 /Users/name/code</Text>
							<Text dimColor>Enter 保存并下一步 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'repoSelect' && (
					<Box flexDirection="column">
						<Text>选择仓库 ({storeData?.projectDir}):</Text>
						<Box marginTop={1} flexDirection="column">
							{repos.length === 0 ? (
								<Text dimColor>目录为空，或路径不正确</Text>
							) : (
								repos.slice(repoVisibleStart, repoVisibleStart + VISIBLE_COUNT).map((repo, i) => {
									const actualIndex = repoVisibleStart + i;
									return (
										<Box key={repo}>
											<Text color={actualIndex === repoSelectIndex ? 'cyan' : 'white'}>
												{actualIndex === repoSelectIndex ? '▸ ' : '  '}
												{repo}
											</Text>
										</Box>
									);
								})
							)}
						</Box>
						<Box marginTop={1}>
							<Text dimColor>↑↓ 移动 Enter 选择 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'repoInput' && (
					<Box flexDirection="column">
						<Box>
							<Text color="cyan">仓库名: </Text>
							<TextInput
								value={formRepo}
								onChange={setFormRepo}
								onSubmit={val => {
									if (val.trim()) setAddStep('branchInput');
								}}
							/>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Enter 下一步 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'branchInput' && (
					<Box flexDirection="column">
						<Box>
							<Text>
								仓库: <Text color="green">{formRepo} ✓</Text>
							</Text>
						</Box>
						<Box>
							<Text color="cyan">分支名: </Text>
							<TextInput
								value={formBranch}
								onChange={setFormBranch}
								onSubmit={val => {
									if (val.trim()) setAddStep('descInput');
								}}
							/>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Enter 下一步 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'descInput' && (
					<Box flexDirection="column">
						<Box>
							<Text>
								仓库: <Text color="green">{formRepo} ✓</Text>
							</Text>
						</Box>
						<Box>
							<Text>
								分支: <Text color="green">{formBranch} ✓</Text>
							</Text>
						</Box>
						<Box>
							<Text color="cyan">描述: </Text>
							<TextInput
								value={formDesc}
								onChange={setFormDesc}
								onSubmit={() => finishAdd()}
							/>
						</Box>
						<Box marginTop={1}>
							<Text dimColor>Enter 确认创建 Esc 取消</Text>
						</Box>
					</Box>
				)}

				{addStep === 'gitPrompt' && (
					<Box flexDirection="column">
						<Box>
							<Text color="green">记录已保存 ✓</Text>
						</Box>
						<Box marginTop={1}>
							<Text color="yellow">是否要在目标仓库 ({formRepo}) 中真实创建分支 '{formBranch}' ? [y]是 [n]否</Text>
						</Box>
					</Box>
				)}
			</Box>
		);
	}

	// List / Action view
	return (
		<Box flexDirection="column" paddingX={2}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					🌿 分支管理
				</Text>
				<Text dimColor> ({branches.length} 项)</Text>
			</Box>

			{branches.length === 0 ? (
				<Text dimColor> 暂无分支记录，按 a 新增</Text>
			) : (
				branches.slice(visibleStart, visibleStart + VISIBLE_COUNT).map((b, index) => {
					const actualIndex = visibleStart + index;
					const isSel = actualIndex === selectedIndex;
					return (
						<Box key={b.id} flexDirection="column">
							<Box>
								<Text color={isSel ? 'cyan' : 'white'}>
									{isSel ? '▸ ' : '  '}
								</Text>
								<Text bold color="green">
									{b.repo}
								</Text>
								<Text dimColor> / </Text>
								<Text bold color="yellow">
									{b.branch}
								</Text>
								{b.description && (
									<Text>
										{' '}
										<Text dimColor>- {b.description}</Text>
									</Text>
								)}
							</Box>
							{isSel && mode === 'action' && (
								<Box marginLeft={3}>
									<Text color="red">[d]删除 </Text>
									<Text dimColor>[Esc]返回</Text>
								</Box>
							)}
							{isSel && mode === 'deleteGitPrompt' && (
								<Box marginLeft={3}>
									<Text color="yellow">
										是否同时删除本地 git 分支? [y]是 [n]仅删除记录 [Esc]取消
									</Text>
								</Box>
							)}
						</Box>
					);
				})
			)}

			<Box marginTop={1}>
				<Text dimColor>
					{mode === 'list' ? '↑↓ 移动 Enter 选择  a 新增' : ''}
				</Text>
			</Box>
		</Box>
	);
}
