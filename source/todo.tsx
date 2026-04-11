import React, { useState, useEffect } from 'react';
import { Box, Text, useInput } from 'ink';
import TextInput from 'ink-text-input';
import { type Todo } from './types.js';
import { loadData, saveData, generateId } from './store.js';
import { exec } from 'child_process';

type TodoMode = 'list' | 'action' | 'add' | 'edit' | 'context-view' | 'context-edit';

function MultiLineInput({
	value,
	onChange,
	onSubmit,
	onCancel,
	isActive,
}: {
	value: string;
	onChange: (v: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
	isActive: boolean;
}) {
	const [cursor, setCursor] = useState({ row: 0, col: 0 });
	const lines = value.split('\n');

	useInput((input, key) => {
		if (!isActive) return;

		let { row, col } = cursor;

		// Some emulators emit \n or CSI escape sequences for Shift+Enter natively, which appear in input
		if (input === '\n' || input === '\r\n' || input === '\x1b[13;2u') {
			const line = lines[row] || '';
			lines[row] = line.slice(0, col);
			lines.splice(row + 1, 0, line.slice(col));
			onChange(lines.join('\n'));
			setCursor({ row: row + 1, col: 0 });
			return;
		}

		if (key.return) {
			if (key.shift) {
				// Triggered if the environment correctly flags shift+return
				const line = lines[row] || '';
				lines[row] = line.slice(0, col);
				lines.splice(row + 1, 0, line.slice(col));
				onChange(lines.join('\n'));
				setCursor({ row: row + 1, col: 0 });
			} else {
				onSubmit();
			}
			return;
		}

		if (key.escape) {
			onCancel();
			return;
		}

		if (key.upArrow) {
			row = key.meta ? Math.max(0, row - 3) : Math.max(0, row - 1);
			col = Math.min(col, (lines[row] || '').length);
			setCursor({ row, col });
			return;
		}
		if (key.downArrow) {
			row = key.meta ? Math.min(lines.length - 1, row + 3) : Math.min(lines.length - 1, row + 1);
			col = Math.min(col, (lines[row] || '').length);
			setCursor({ row, col });
			return;
		}
		if (key.leftArrow) {
			if (key.meta) {
				if (col > 0) {
					const leftPart = (lines[row] || '').slice(0, col).trimEnd();
					const lastSpace = leftPart.lastIndexOf(' ');
					col = lastSpace >= 0 ? lastSpace + 1 : 0;
				} else if (row > 0) {
					row--;
					col = (lines[row] || '').length;
				}
			} else {
				if (col > 0) {
					col--;
				} else if (row > 0) {
					row--;
					col = (lines[row] || '').length;
				}
			}
			setCursor({ row, col });
			return;
		}
		if (key.rightArrow) {
			if (key.meta) {
				const line = lines[row] || '';
				if (col < line.length) {
					const rightPart = line.slice(col);
					const match = rightPart.match(/^\s*\S+/);
					col += match ? match[0].length : rightPart.length;
				} else if (row < lines.length - 1) {
					row++;
					col = 0;
				}
			} else {
				if (col < (lines[row] || '').length) {
					col++;
				} else if (row < lines.length - 1) {
					row++;
					col = 0;
				}
			}
			setCursor({ row, col });
			return;
		}
		if (key.backspace || key.delete) {
			if (col > 0) {
				const line = lines[row] || '';
				lines[row] = line.slice(0, col - 1) + line.slice(col);
				col--;
				onChange(lines.join('\n'));
				setCursor({ row, col });
			} else if (row > 0) {
				const prevLen = (lines[row - 1] || '').length;
				lines[row - 1] = (lines[row - 1] || '') + (lines[row] || '');
				lines.splice(row, 1);
				row--;
				col = prevLen;
				onChange(lines.join('\n'));
				setCursor({ row, col });
			}
			return;
		}

		if (input) {
			const line = lines[row] || '';
			lines[row] = line.slice(0, col) + input + line.slice(col);
			col += input.length;
			onChange(lines.join('\n'));
			setCursor({ row, col });
		}
	},
		{ isActive },
	);

	return (
		<Box flexDirection="column" borderStyle="round" borderColor="cyan" paddingX={1}>
			{lines.length === 0 && (
				<Text>
					<Text inverse> </Text>
				</Text>
			)}
			{lines.map((l, r) => {
				if (!isActive) {
					return <Text key={r}>{l}</Text>;
				}
				if (r === cursor.row) {
					const before = l.slice(0, cursor.col);
					const at = l[cursor.col] || ' ';
					const after = l.slice(cursor.col + 1);
					return (
						<Text key={r}>
							{before}
							<Text inverse>{at}</Text>
							{after}
						</Text>
					);
				}
				return <Text key={r}>{l || ' '}</Text>;
			})}
		</Box>
	);
}

type Props = {
	isActive: boolean;
	onFormModeChange: (inForm: boolean) => void;
};

function getDateStatus(
	todo: Todo,
): 'upcoming' | 'active' | 'overdue' {
	const now = new Date();
	const cy = now.getFullYear();
	const sy = todo.startYear || cy;
	const ey = todo.endYear || cy;
	const sm = parseInt(todo.startDate.slice(0, 2), 10) - 1;
	const sd = parseInt(todo.startDate.slice(2, 4), 10);
	const em = parseInt(todo.endDate.slice(0, 2), 10) - 1;
	const ed = parseInt(todo.endDate.slice(2, 4), 10);
	const start = new Date(sy, sm, sd, 0, 0, 0);
	const end = new Date(ey, em, ed, 23, 59, 59);
	if (now < start) return 'upcoming';
	if (now <= end) return 'active';
	return 'overdue';
}

function getStatusColor(status: string): string {
	if (status === 'upcoming') return 'green';
	if (status === 'active') return 'yellow';
	return 'red';
}

export default function TodoList({ isActive, onFormModeChange }: Props) {
	const [todos, setTodos] = useState<Todo[]>([]);
	const [mode, setMode] = useState<TodoMode>('list');
	const [selectedIndex, setSelectedIndex] = useState(0);
	const [formName, setFormName] = useState('');
	const [formStart, setFormStart] = useState('');
	const [formEnd, setFormEnd] = useState('');
	const [formStep, setFormStep] = useState(0);
	const [editingId, setEditingId] = useState<string | null>(null);
	const [editContextValue, setEditContextValue] = useState('');

	const VISIBLE_COUNT = 14;
	const [visibleStart, setVisibleStart] = useState(0);

	useEffect(() => {
		if (selectedIndex < visibleStart) setVisibleStart(selectedIndex);
		else if (selectedIndex >= visibleStart + VISIBLE_COUNT) setVisibleStart(selectedIndex - VISIBLE_COUNT + 1);
	}, [selectedIndex, visibleStart]);

	useEffect(() => {
		const data = loadData();
		setTodos(data.todos);
	}, []);

	useEffect(() => {
		onFormModeChange(mode === 'add' || mode === 'edit' || mode === 'context-edit');
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
		{ isActive: isActive && mode === 'list' },
	);

	// Action mode
	useInput(
		(input, key) => {
			const todo = todos[selectedIndex];
			if (!todo) return;

			if (input === 'c') {
				persistTodos(
					todos.map(t =>
						t.id === todo.id ? { ...t, completed: !t.completed } : t,
					),
				);
				setMode('list');
			} else if (input === 'v') {
				setMode('context-view');
			} else if (input === 'm') {
				setEditContextValue(todo.context || '');
				setMode('context-edit');
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
		{ isActive: isActive && mode === 'action' },
	);

	// Context view escape
	useInput(
		(_input, key) => {
			if (key.escape) {
				setMode('action');
			}
		},
		{ isActive: isActive && mode === 'context-view' },
	);

	// Form escape
	useInput(
		(_input, key) => {
			if (key.escape) {
				setEditingId(null);
				setMode('list');
			}
		},
		{ isActive: isActive && (mode === 'add' || mode === 'edit') },
	);

	const handleSaveContext = (id: string) => {
		persistTodos(
			todos.map(t =>
				t.id === id ? { ...t, context: editContextValue } : t,
			),
		);
		setMode('action');
	};

	const handleFormSubmit = (value: string) => {
		if (formStep === 0) {
			if (value.trim()) setFormStep(1);
		} else if (formStep === 1) {
			if (/^\d{4}$/.test(value)) setFormStep(2);
		} else if (formStep === 2) {
			if (!/^\d{4}$/.test(value)) return;
			if (mode === 'add') {
				const now = new Date();
				const cy = now.getFullYear();
				const sm = parseInt(formStart.slice(0, 2), 10);
				const sd = parseInt(formStart.slice(2, 4), 10);
				const em = parseInt(formEnd.slice(0, 2), 10);
				const ed = parseInt(formEnd.slice(2, 4), 10);

				const startYear = cy;
				const endYear = em < sm ? cy + 1 : cy;

				const newTodo: Todo = {
					id: generateId(),
					name: formName.trim(),
					startDate: formStart,
					endDate: formEnd,
					startYear,
					endYear,
					completed: false,
				};
				persistTodos([...todos, newTodo]);

				const script = `tell application "Calendar"
	set theCal to first calendar whose writable is true
	set dStart to (current date)
	set year of dStart to ${startYear}
	set month of dStart to ${sm}
	set day of dStart to ${sd}
	set hours of dStart to 0
	set minutes of dStart to 0
	set seconds of dStart to 0
	
	set dEnd to (current date)
	set year of dEnd to ${endYear}
	set month of dEnd to ${em}
	set day of dEnd to ${ed}
	set hours of dEnd to 23
	set minutes of dEnd to 59
	set seconds of dEnd to 59
	
	make new event at end of events of theCal with properties {summary:"${newTodo.name.replace(/"/g, '\\"')}", start date:dStart, end date:dEnd}
end tell`;

				exec(`osascript << 'EOF'\n${script}\nEOF`, (err) => {
					if (err) {
						// Ignored intentionally so it doesn't crash the terminal UI
					}
				});
			} else if (editingId) {
				const now = new Date();
				const cy = now.getFullYear();
				const sm = parseInt(formStart.slice(0, 2), 10);
				const em = parseInt(formEnd.slice(0, 2), 10);
				const startYear = cy;
				const endYear = em < sm ? cy + 1 : cy;

				persistTodos(
					todos.map(t =>
						t.id === editingId
							? {
								...t,
								name: formName.trim(),
								startDate: formStart,
								endDate: formEnd,
								startYear,
								endYear,
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
				todos.slice(visibleStart, visibleStart + VISIBLE_COUNT).map((todo, index) => {
					const actualIndex = visibleStart + index;
					const isSel = actualIndex === selectedIndex;
					const status = todo.completed
						? 'completed'
						: getDateStatus(todo);
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
									<Text color="cyan">[v]查看上下文 </Text>
									<Text color="magenta">[m]修改上下文 </Text>
									<Text color="green">[c]完成 </Text>
									<Text color="red">[d]删除 </Text>
									<Text color="yellow">[e]修改 </Text>
									<Text dimColor>[Esc]返回</Text>
								</Box>
							)}
							{isSel && mode === 'context-view' && (
								<Box marginLeft={3} flexDirection="column">
									<Box borderStyle="round" borderColor="cyan" paddingX={1}>
										<Text>{todo.context || '无上下文信息'}</Text>
									</Box>
									<Box>
										<Text dimColor>[Esc]返回</Text>
									</Box>
								</Box>
							)}
							{isSel && mode === 'context-edit' && (
								<Box marginLeft={3} flexDirection="column">
									<MultiLineInput
										value={editContextValue}
										onChange={setEditContextValue}
										onSubmit={() => handleSaveContext(todo.id)}
										onCancel={() => setMode('action')}
										isActive={mode === 'context-edit'}
									/>
									<Box marginTop={1}>
										<Text dimColor>Shift+Enter 换行 / Enter 保存 / Esc 取消</Text>
									</Box>
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
