import {execSync} from 'node:child_process';
import os from 'node:os';
import React, {useState, useEffect, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import RssParser from 'rss-parser';
import {type RssFeed, type StoreData} from './types.js';
import {loadData, saveData, generateId} from './store.js';

type RssMode =
	| 'list'
	| 'action'
	| 'add-name'
	| 'add-url'
	| 'edit-name'
	| 'edit-url'
	| 'articles';

type ArticleEntry = {
	title: string;
	link: string;
};

type Props = {
	readonly isActive: boolean;
	readonly onFormModeChange: (inForm: boolean) => void;
};

const pageSize = 10;
const parser = new RssParser({timeout: 8000});

export default function RssFeedTab({isActive, onFormModeChange}: Props) {
	const [storeData, setStoreData] = useState<StoreData | undefined>(undefined);
	const [feeds, setFeeds] = useState<RssFeed[]>([]);
	const [mode, setMode] = useState<RssMode>('list');
	const [selectedIndex, setSelectedIndex] = useState(0);

	const [formName, setFormName] = useState('');
	const [formUrl, setFormUrl] = useState('');

	const [articles, setArticles] = useState<ArticleEntry[]>([]);
	const [articleIndex, setArticleIndex] = useState(0);
	const [articlePage, setArticlePage] = useState(0);
	const [articleLoading, setArticleLoading] = useState(false);
	const [articleError, setArticleError] = useState('');

	useEffect(() => {
		const data = loadData();
		setStoreData(data);
		setFeeds(data.rssFeeds ?? []);
	}, []);

	const isFormMode =
		mode === 'add-name' ||
		mode === 'add-url' ||
		mode === 'edit-name' ||
		mode === 'edit-url';
	const shouldCaptureGlobalKeys = mode !== 'list';

	useEffect(() => {
		onFormModeChange(shouldCaptureGlobalKeys);
	}, [onFormModeChange, shouldCaptureGlobalKeys]);

	const persistFeeds = useCallback(
		(newFeeds: RssFeed[]) => {
			setFeeds(newFeeds);
			if (storeData) {
				const next = {...storeData, rssFeeds: newFeeds};
				setStoreData(next);
				saveData(next);
			}
		},
		[storeData],
	);

	const fetchArticles = useCallback(async (url: string) => {
		setArticleLoading(true);
		setArticleError('');
		setArticles([]);
		setArticleIndex(0);
		setArticlePage(0);
		try {
			const feed = await parser.parseURL(url);
			const items: ArticleEntry[] = [];
			for (const item of feed.items) {
				items.push({
					title: item.title ?? '(无标题)',
					link: item.link ?? '',
				});
			}

			setArticles(items);
		} catch (error: unknown) {
			setArticleError(error instanceof Error ? error.message : String(error));
		} finally {
			setArticleLoading(false);
		}
	}, []);

	const totalListItems = feeds.length + 1;

	// --- List mode ---
	useInput(
		(_input, key) => {
			if (key.upArrow) {
				setSelectedIndex(index => Math.max(0, index - 1));
			} else if (key.downArrow) {
				setSelectedIndex(index => Math.min(totalListItems - 1, index + 1));
			} else if (key.return) {
				if (selectedIndex === feeds.length) {
					setFormName('');
					setFormUrl('');
					setMode('add-name');
				} else {
					setMode('action');
				}
			}
		},
		{isActive: isActive && mode === 'list'},
	);

	// --- Action mode (view / edit / delete) ---
	useInput(
		(input, key) => {
			if (key.escape) {
				setMode('list');
				return;
			}

			const selected = feeds[selectedIndex];
			if (!selected) {
				setMode('list');
				return;
			}

			if (input === 'v' || key.return) {
				setMode('articles');
				void fetchArticles(selected.url);
			} else if (input === 'e') {
				setFormName(selected.name);
				setFormUrl(selected.url);
				setMode('edit-name');
			} else if (input === 'd') {
				const next = feeds.filter((_, index) => index !== selectedIndex);
				persistFeeds(next);
				setSelectedIndex(index => Math.max(0, Math.min(index, next.length)));
				setMode('list');
			}
		},
		{isActive: isActive && mode === 'action'},
	);

	// --- Articles mode ---
	useInput(
		(_input, key) => {
			if (key.escape) {
				setMode('list');
				return;
			}

			const pageStart = articlePage * pageSize;
			const pageEnd = Math.min(pageStart + pageSize, articles.length);
			const totalPages = Math.ceil(articles.length / pageSize);

			if (key.upArrow) {
				setArticleIndex(index => Math.max(pageStart, index - 1));
			} else if (key.downArrow) {
				setArticleIndex(index => Math.min(pageEnd - 1, index + 1));
			} else if (key.leftArrow && articlePage > 0) {
				const newPage = articlePage - 1;
				setArticlePage(newPage);
				setArticleIndex(newPage * pageSize);
			} else if (key.rightArrow && articlePage < totalPages - 1) {
				const newPage = articlePage + 1;
				setArticlePage(newPage);
				setArticleIndex(newPage * pageSize);
			} else if (key.return) {
				const article = articles[articleIndex];
				if (article?.link) {
					try {
						const platform = os.platform();
						const command =
							platform === 'darwin'
								? `open "${article.link}"`
								: platform === 'win32'
								? `start "" "${article.link}"`
								: `xdg-open "${article.link}"`;
						execSync(command, {stdio: 'ignore'});
					} catch {}
				}
			}
		},
		{isActive: isActive && mode === 'articles'},
	);

	// --- Text input escape for add / edit ---
	useInput(
		(_input, key) => {
			if (key.escape) {
				setMode('list');
			}
		},
		{isActive: isActive && isFormMode},
	);

	// ========== RENDER ==========

	// --- Add name ---
	if (mode === 'add-name') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						📝 新增订阅源
					</Text>
				</Box>
				<Box>
					<Text color="cyan">名称: </Text>
					<TextInput
						value={formName}
						onChange={setFormName}
						onSubmit={value => {
							if (value.trim()) {
								setMode('add-url');
							}
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Enter 下一步 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// --- Add url ---
	if (mode === 'add-url') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						📝 新增订阅源
					</Text>
				</Box>
				<Box>
					<Text>
						名称: <Text color="green">{formName} ✓</Text>
					</Text>
				</Box>
				<Box>
					<Text color="cyan">URL: </Text>
					<TextInput
						value={formUrl}
						onChange={setFormUrl}
						onSubmit={value => {
							if (value.trim()) {
								const newFeed: RssFeed = {
									id: generateId(),
									name: formName.trim(),
									url: value.trim(),
								};
								persistFeeds([...feeds, newFeed]);
								setMode('list');
							}
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Enter 确认新增 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// --- Edit name ---
	if (mode === 'edit-name') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						✏️ 修改订阅源
					</Text>
				</Box>
				<Box>
					<Text color="cyan">名称: </Text>
					<TextInput
						value={formName}
						onChange={setFormName}
						onSubmit={value => {
							if (value.trim()) {
								setMode('edit-url');
							}
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Enter 下一步 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// --- Edit url ---
	if (mode === 'edit-url') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						✏️ 修改订阅源
					</Text>
				</Box>
				<Box>
					<Text>
						名称: <Text color="green">{formName} ✓</Text>
					</Text>
				</Box>
				<Box>
					<Text color="cyan">URL: </Text>
					<TextInput
						value={formUrl}
						onChange={setFormUrl}
						onSubmit={value => {
							if (value.trim()) {
								const updated = feeds.map((f, index) =>
									index === selectedIndex
										? {...f, name: formName.trim(), url: value.trim()}
										: f,
								);
								persistFeeds(updated);
								setMode('list');
							}
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>Enter 确认修改 Esc 取消</Text>
				</Box>
			</Box>
		);
	}

	// --- Articles view ---
	if (mode === 'articles') {
		const selected = feeds[selectedIndex];
		const pageStart = articlePage * pageSize;
		const pageEnd = Math.min(pageStart + pageSize, articles.length);
		const totalPages = Math.max(1, Math.ceil(articles.length / pageSize));
		const pageArticles = articles.slice(pageStart, pageEnd);

		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						📰 {selected?.name ?? '订阅源'}
					</Text>
					<Text dimColor> ({selected?.url})</Text>
				</Box>

				{articleLoading && <Text dimColor>正在加载文章列表…</Text>}

				{articleError && <Text color="red">加载失败: {articleError}</Text>}

				{!articleLoading && !articleError && articles.length === 0 && (
					<Text dimColor>暂无文章</Text>
				)}

				{!articleLoading &&
					pageArticles.map((article, offset) => {
						const globalIndex = pageStart + offset;
						const isCurrent = globalIndex === articleIndex;
						return (
							<Box key={article.link || String(globalIndex)}>
								<Text color={isCurrent ? 'cyan' : 'white'}>
									{isCurrent ? '▸ ' : '  '}
									{article.title}
								</Text>
							</Box>
						);
					})}

				<Box marginTop={1}>
					<Text dimColor>
						{`第 ${articlePage + 1}/${totalPages} 页  共 ${articles.length} 篇`}
					</Text>
				</Box>
				<Box>
					<Text dimColor>↑↓ 移动 ←→ 翻页 Enter 浏览器打开 Esc 返回</Text>
				</Box>
			</Box>
		);
	}

	// --- List / Action view ---
	return (
		<Box flexDirection="column" paddingX={2}>
			<Box marginBottom={1}>
				<Text bold color="cyan">
					📡 RSS 订阅
				</Text>
				<Text dimColor> ({feeds.length} 项)</Text>
			</Box>

			{feeds.length === 0 && <Text dimColor> 暂无订阅源</Text>}

			{feeds.map((feed, index) => {
				const isSel = index === selectedIndex;
				return (
					<Box key={feed.id} flexDirection="column">
						<Box>
							<Text color={isSel ? 'cyan' : 'white'}>
								{isSel ? '▸ ' : '  '}
							</Text>
							<Text bold color="green">
								{feed.name}
							</Text>
							<Text dimColor> - {feed.url}</Text>
						</Box>
						{isSel && mode === 'action' && (
							<Box marginLeft={3}>
								<Text color="cyan">[v]查看文章 </Text>
								<Text color="yellow">[e]编辑 </Text>
								<Text color="red">[d]删除 </Text>
								<Text dimColor>[Esc]返回</Text>
							</Box>
						)}
					</Box>
				);
			})}

			<Box>
				<Text color={selectedIndex === feeds.length ? 'cyan' : 'gray'}>
					{selectedIndex === feeds.length ? '▸ ' : '  '}+ 新增订阅源
				</Text>
			</Box>

			<Box marginTop={1}>
				<Text dimColor>{mode === 'list' ? '↑↓ 移动 Enter 选择' : ''}</Text>
			</Box>
		</Box>
	);
}
