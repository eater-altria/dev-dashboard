import React, {useState, useEffect} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {type Todo} from './types.js';
import {loadData, saveData, generateId} from './store.js';

type TodoMode = 'list' | 'action' | 'add' | 'edit';

type Props = {
	isActive: boolean;
	onFormModeChange: (inForm: boolean) => void;
};

function getDateStatus(
	startDate: string,
	endDate: string,
): 'upcoming' | 'active' | 'overdue' {
	const now = new Date();
	const year = now.getFullYear();
	const sm = parseInt(startDate.slice(0, 2), 10) - 1;
	const sd = parseInt(startDate.slice(2, 4), 10);
	const em = parseInt(endDate.slice(0, 2), 10) - 1;
	const ed = parseInt(endDate.slice(2, 4), 10);
	const start = new Date(year, sm, sd, 0, 0, 0);
	const end = new Date(year, em, ed, 23, 59, 59);
	if (now < start) return 'upcoming';
	if (now <= end) return 'active';
	return 'overdue';
}

function getStatusColor(status: string): string {
	if (status === 'upcoming') return 'green';
	if (status === 'active') return 'yellow';
	return 'red';
}

export default function TodoList({isActive, onFormModeChange}: Props) {
	const [todos, setTodos] = useState<Todo[]>([]);
	const [mode, setMode] = useState<TodoMode>('list');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [formName, setFormName] = useState('');
	const [formStart, setFormStart] = useState('');
	const [formEnd, setFormEnd] = useState('');
	const [formStep, setFormStep] = useState(0);
	const [editingId, setEditingId] = useState<string | null>(null);

	useEffect(() => {
		const data = loadData();
		setTodos(data.todos);
	}, []);

	useEffect(() => {
		onFormModeChange(mode === 'add' || mode === 'edit');
	}, [mode]);

	const persistTodos = (newTodos: Todo[]) => {
		setTodos(newTodos);
		const data = loadData();
		data.todos = newTodos;
		saveData(data);
	};

	const enterAddMode = () => {
		setFormName('');
		setFormStart('');
		setFormEnd('');
		setFormStep(0);
		setMode('add');
	};

	const enterEditMode = (todo: Todo) => {
		setFormName(todo.name);
		setFormStart(todo.startDate);
		setFormEnd(todo.endDate);
		setEditingId(todo.id);
		setFormStep(0);
		setMode('edit');
	};

	// List mode navigation
	useInput(
		(input, key) => {
			if (key.upArrow) {
				setSelectedIndex(i => Math.max(0, i - 1));
			} else if (key.downArrow) {
				setSelectedIndex(i => Math.min(todos.length - 1, i + 1));
			} else if (key.return && todos.length > 0) {
				setMode('action');
			} else if (input === 'a') {
				enterAddMode();
			}
		},
		{isActive: isActive && mode === 'list'},
	);

	// Action mode
	useInput(
		(input, key) => {
			const todo = todos[selectedIndex];
			if (!todo) return;

			if (input === 'c') {
				persistTodos(
					todos.map(t =>
						t.id === todo.id ? {...t, completed: !t.completed} : t,
					),
				);
				setMode('list');
			} else if (input === 'd') {
				const newTodos = todos.filter(t => t.id !== todo.id);
				persistTodos(newTodos);
				setSelectedIndex(i => Math.min(i, newTodos.length - 1));
				setMode('list');
			} else if (input === 'e') {
				enterEditMode(todo);
			} else if (key.escape) {
				setMode('list');
			}
		},
		{isActive: isActive && mode === 'action'},
	);

	// Form escape
	useInput(
		(_input, key) => {
			if (key.escape) {
				setEditingId(null);
				setMode('list');
			}
		},
		{isActive: isActive && (mode === 'add' || mode === 'edit')},
	);

	const handleFormSubmit = (value: string) => {
		if (formStep === 0) {
			if (value.trim()) setFormStep(1);
		} else if (formStep === 1) {
			if (/^\d{4}$/.test(value)) setFormStep(2);
		} else if (formStep === 2) {
			if (!/^\d{4}$/.test(value)) return;
			if (mode === 'add') {
				const newTodo: Todo = {
					id: generateId(),
					name: formName.trim(),
					startDate: formStart,
					endDate: formEnd,
					completed: false,
				};
				persistTodos([...todos, newTodo]);
			} else if (editingId) {
				persistTodos(
					todos.map(t =>
						t.id === editingId
							? {
									...t,
									name: formName.trim(),
									startDate: formStart,
									endDate: formEnd,
							  }
							: t,
					),
				);
				setEditingId(null);
			}

			setMode('list');
		}
	};

	// ---------- RENDER ----------

	if (mode === 'add' || mode === 'edit') {
		const title = mode === 'add' ? '📝 新增待办' : '✏️  修改待办';
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						{title}
					</Text>
				</Box>

				<Box>
					<Text color={formStep === 0 ? 'cyan' : 'white'}>名称: </Text>
					{formStep === 0 ? (
						<TextInput
							value={formName}
							onChange={setFormName}
							onSubmit={() => handleFormSubmit(formName)}
						/>
					) : (
						<Text>
							{formName} <Text color="green">✓</Text>
						</Text>
					)}
				</Box>

				<Box>
					<Text color={formStep === 1 ? 'cyan' : 'white'}>
						开始日期(MMDD):{' '}
					</Text>
					{formStep === 1 ? (
						<TextInput
							value={formStart}
							onChange={setFormStart}
							onSubmit={() => handleFormSubmit(formStart)}
						/>
					) : formStep > 1 ? (
						<Text>
							{formStart} <Text color="green">✓</Text>
						</Text>
					) : (
						<Text dimColor>-</Text>
					)}
				</Box>

				<Box>
					<Text color={formStep === 2 ? 'cyan' : 'white'}>
						结束日期(MMDD):{' '}
					</Text>
					{formStep === 2 ? (
						<TextInput
							value={formEnd}
							onChange={setFormEnd}
							onSubmit={() => handleFormSubmit(formEnd)}
						/>
					) : (
						<Text dimColor>-</Text>
					)}
				</Box>

				<Box marginTop={1}>
					<Text dimColor>Enter 下一步 / 确认 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// List / Action view
	return (
		<Box flexDirection="column" paddingX={2}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					📋 待办列表
				</Text>
				<Text dimColor> ({todos.length} 项)</Text>
			</Box>

			{todos.length === 0 ? (
				<Text dimColor> 暂无待办项，按 a 新增</Text>
			) : (
				todos.map((todo, index) => {
					const isSel = index === selectedIndex;
					const status = todo.completed
						? 'completed'
						: getDateStatus(todo.startDate, todo.endDate);
					const color = todo.completed ? 'gray' : getStatusColor(status);
					const cursor = isSel ? '▸' : ' ';
					const check = todo.completed ? '✓' : ' ';

					return (
						<Box key={todo.id} flexDirection="column">
							<Box>
								<Text color={isSel ? 'cyan' : 'white'}>{cursor} </Text>
								<Text color={color}>
									[{check}]{' '}
									{todo.completed ? (
										<Text strikethrough dimColor>
											{todo.name}
										</Text>
									) : (
										todo.name
									)}
								</Text>
								<Text> </Text>
								<Text dimColor>
									{todo.startDate}-{todo.endDate}
								</Text>
								{status === 'overdue' && (
									<Text color="red" bold>
										{' '}
										【已逾期】
									</Text>
								)}
							</Box>
							{isSel && mode === 'action' && (
								<Box marginLeft={3}>
									<Text color="green">[c]完成 </Text>
									<Text color="red">[d]删除 </Text>
									<Text color="yellow">[e]修改 </Text>
									<Text dimColor>[Esc]返回</Text>
								</Box>
							)}
						</Box>
					);
				})
			)}

			<Box marginTop={1}>
				<Text dimColor>
					{mode === 'list' ? '↑↓ 移动  Enter 选择  a 新增' : ''}
				</Text>
			</Box>
		</Box>
	);
}
