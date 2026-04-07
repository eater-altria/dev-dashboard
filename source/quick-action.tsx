import React, {useState, useEffect, useMemo} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import fs from 'node:fs';
import path from 'node:path';
import {execSync} from 'node:child_process';
import {type StoreData} from './types.js';
import {loadData, saveData} from './store.js';

type Props = {
	isActive: boolean;
	onFormModeChange: (inForm: boolean) => void;
};

type ActionItemType = 'npm' | 'global' | 'add_global';

type ActionItem = {
	type: ActionItemType;
	label: string;
	command: string; // The literal bash command to execute
};

export default function QuickActionList({isActive, onFormModeChange}: Props) {
	const [storeData, setStoreData] = useState<StoreData | null>(null);
	const [npmScripts, setNpmScripts] = useState<{name: string; command: string}[]>([]);
	const [mode, setMode] = useState<'list' | 'add'>('list');
	const [newCommandText, setNewCommandText] = useState('');
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => {
		const data = loadData();
		setStoreData(data);
		
		// Attempt to parse package.json in the Current Working Directory
		try {
			const pkgPath = path.join(process.cwd(), 'package.json');
			if (fs.existsSync(pkgPath)) {
				const raw = fs.readFileSync(pkgPath, 'utf8');
				const pkg = JSON.parse(raw);
				if (pkg.scripts) {
					const scriptEntries = Object.entries(pkg.scripts).map(([name, _cmd]) => ({
						name,
						command: `npm run ${name}`
					}));
					setNpmScripts(scriptEntries);
				}
			}
		} catch {} // Safely ignore errors (e.g. invalid JSON or no permission)
	}, []);

	useEffect(() => {
		onFormModeChange(mode === 'add');
	}, [mode, onFormModeChange]);

	const saveGlobalCommands = (commands: string[]) => {
		if (storeData) {
			const newData = {...storeData, globalCommands: commands};
			setStoreData(newData);
			saveData(newData);
		}
	};

	// Construct unified flat list layout for arrow up/down cursor binding
	const listItems = useMemo(() => {
		const items: ActionItem[] = [];
		npmScripts.forEach(script => {
			items.push({
				type: 'npm',
				label: script.name,
				command: script.command
			});
		});

		const globalCmds = storeData?.globalCommands || [];
		globalCmds.forEach(cmd => {
			items.push({
				type: 'global',
				label: cmd,
				command: cmd
			});
		});

		items.push({
			type: 'add_global',
			label: '增加全局命令',
			command: ''
		});

		return items;
	}, [npmScripts, storeData?.globalCommands]);

	// Ensures the selection bounds are tight after rerenders or additions
	useEffect(() => {
		if (selectedIndex >= listItems.length) {
			setSelectedIndex(Math.max(0, listItems.length - 1));
		}
	}, [listItems, selectedIndex]);

	useInput((_input, key) => {
		if (mode !== 'list') return;

		if (key.upArrow) {
			setSelectedIndex(i => Math.max(0, i - 1));
		} else if (key.downArrow) {
			setSelectedIndex(i => Math.min(listItems.length - 1, i + 1));
		} else if (key.return && listItems.length > 0) {
			const selected = listItems[selectedIndex];
			if (selected) {
				if (selected.type === 'add_global') {
					setNewCommandText('');
					setMode('add');
				} else {
					// Execute the command synchronously in foreground.
					try {
						// Note: Running commands with stdio: 'inherit' temporarily overrides Ink rendering. 
						execSync(selected.command, {stdio: 'inherit'});
					} catch {}
				}
			}
		}
	}, {isActive: isActive && mode === 'list'});

	useInput((_input, key) => {
		if (mode === 'add' && key.escape) {
			setMode('list');
		}
	}, {isActive: isActive && mode === 'add'});

	// Render Form View
	if (mode === 'add') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">✏️ 新增全局命令</Text>
				</Box>
				<Box>
					<Text color="cyan">命令: </Text>
					<TextInput 
						value={newCommandText}
						onChange={setNewCommandText}
						onSubmit={val => {
							if (val.trim()) {
								const current = storeData?.globalCommands || [];
								saveGlobalCommands([...current, val.trim()]);
							}
							setMode('list');
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Enter 确认保存 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// Render List View
	return (
		<Box flexDirection="column" paddingX={2}>
			<Box marginBottom={1}>
				<Text bold color="cyan">🚀 快捷操作</Text>
				<Text dimColor> ({listItems.length - 1} commands)</Text>
			</Box>

			{/* npm commands section */}
			<Box flexDirection="column" marginBottom={1}>
				<Text bold color="blue">- npm命令：</Text>
				{listItems.filter(i => i.type === 'npm').length === 0 ? (
					<Box marginLeft={4}><Text dimColor>无</Text></Box>
				) : (
					listItems.map((item, i) => {
						if (item.type !== 'npm') return null;
						const isSel = i === selectedIndex;
						return (
							<Box key={`npm-${i}`} marginLeft={4}>
								<Text color={isSel ? 'cyan' : 'white'}>
									{isSel ? '▸ ' : '  '}
									{item.label}
								</Text>
							</Box>
						);
					})
				)}
			</Box>

			{/* global commands section */}
			<Box flexDirection="column">
				<Text bold color="green">- 全局快捷命令：</Text>
				{listItems.map((item, i) => {
					if (item.type === 'npm') return null;
					const isSel = i === selectedIndex;
					if (item.type === 'add_global') {
						return (
							<Box key="add-global" marginLeft={4} marginTop={storeData?.globalCommands?.length ? 0 : 0}>
								<Text color={isSel ? 'cyan' : 'gray'}>
									{isSel ? '▸ ' : '  '}
									{item.label}
								</Text>
							</Box>
						);
					}
					
					return (
						<Box key={`global-${i}`} marginLeft={4}>
							<Text color={isSel ? 'cyan' : 'white'}>
								{isSel ? '▸ ' : '  '}
								{item.label}
							</Text>
						</Box>
					);
				})}
			</Box>

			<Box marginTop={1}>
				<Text dimColor>↑↓ 移动 Enter 选择</Text>
			</Box>
		</Box>
	);
}
