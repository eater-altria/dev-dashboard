import React, {useState, useCallback} from 'react';
import {Box, Text, useInput, useApp} from 'ink';
import TodoList from './todo.js';
import BranchList from './branch.js';
import QuickActionList from './quick-action.js';
import PerformanceMonitor from './performance-monitor.js';
import RssFeedTab from './rss-feed.js';

type Tab = 'todo' | 'branch' | 'action' | 'perf' | 'rss';

export default function App() {
	const [activeTab, setActiveTab] = useState<Tab>('todo');
	const [inFormMode, setInFormMode] = useState(false);

	const handleTodoFormMode = useCallback((inForm: boolean) => {
		setInFormMode(inForm);
	}, []);

	const handleBranchFormMode = useCallback((inForm: boolean) => {
		setInFormMode(inForm);
	}, []);

	const handleRssFormMode = useCallback((inForm: boolean) => {
		setInFormMode(inForm);
	}, []);

	const {exit} = useApp();

	// Global key handler — only active when NOT in a form
	useInput(
		(_input, key) => {
			if (key.escape) {
				exit();
				setTimeout(() => process.exit(0), 50);
				return;
			}

			if (key.tab) {
				setActiveTab(previous => {
					if (previous === 'todo') return 'branch';
					if (previous === 'branch') return 'action';
					if (previous === 'action') return 'perf';
					if (previous === 'perf') return 'rss';
					return 'todo';
				});
			}
		},
		{isActive: !inFormMode},
	);

	return (
		<Box flexDirection="column">
			{/* Header */}
			<Box paddingX={1} marginBottom={0}>
				<Text bold color="cyan">
					{'  '}⚡ Dev Dashboard
				</Text>
			</Box>

			{/* Tab bar */}
			<Box paddingX={1}>
				<Text
					bold={activeTab === 'todo'}
					color={activeTab === 'todo' ? 'cyan' : 'gray'}
					inverse={activeTab === 'todo'}
				>
					{' '}
					📋 待办列表{' '}
				</Text>
				<Text> </Text>
				<Text
					bold={activeTab === 'branch'}
					color={activeTab === 'branch' ? 'cyan' : 'gray'}
					inverse={activeTab === 'branch'}
				>
					{' '}
					🌿 分支管理{' '}
				</Text>
				<Text> </Text>
				<Text
					bold={activeTab === 'action'}
					color={activeTab === 'action' ? 'cyan' : 'gray'}
					inverse={activeTab === 'action'}
				>
					{' '}
					🚀 快捷操作{' '}
				</Text>
				<Text> </Text>
				<Text
					bold={activeTab === 'perf'}
					color={activeTab === 'perf' ? 'cyan' : 'gray'}
					inverse={activeTab === 'perf'}
				>
					{' '}
					📊 性能监控{' '}
				</Text>
				<Text> </Text>
				<Text
					bold={activeTab === 'rss'}
					color={activeTab === 'rss' ? 'cyan' : 'gray'}
					inverse={activeTab === 'rss'}
				>
					{' '}
					📡 RSS 订阅{' '}
				</Text>
				<Text dimColor>{'    '}Tab 切换 ESC 退出</Text>
			</Box>

			{/* Content */}
			<Box
				borderStyle="round"
				borderColor="gray"
				flexDirection="column"
				paddingY={1}
			>
				{activeTab === 'todo' && (
					<TodoList isActive onFormModeChange={handleTodoFormMode} />
				)}
				{activeTab === 'branch' && (
					<BranchList isActive onFormModeChange={handleBranchFormMode} />
				)}
				{activeTab === 'action' && (
					<QuickActionList isActive onFormModeChange={setInFormMode} />
				)}
				{activeTab === 'perf' && <PerformanceMonitor isActive />}
				{activeTab === 'rss' && (
					<RssFeedTab isActive onFormModeChange={handleRssFormMode} />
				)}
			</Box>
		</Box>
	);
}
