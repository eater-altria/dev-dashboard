import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {type StoreData} from './types.js';

const storePath = path.join(os.homedir(), '.dev-dashboard-data.json');

export function loadData(): StoreData {
	try {
		const raw = fs.readFileSync(storePath, 'utf8');
		const data = JSON.parse(raw) as StoreData;
		if (!data.globalCommands) {
			data.globalCommands = [];
		}

		if (!data.rssFeeds) {
			data.rssFeeds = [];
		}

		return data;
	} catch {
		return {todos: [], branches: [], globalCommands: [], rssFeeds: []};
	}
}

export function saveData(data: StoreData): void {
	fs.writeFileSync(storePath, JSON.stringify(data, null, 2), 'utf8');
}

export function generateId(): string {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function getProjectRepos(directory: string): string[] {
	try {
		// Expand ~ if present
		const fullPath = directory.startsWith('~')
			? path.join(os.homedir(), directory.slice(1))
			: directory;

		const entries = fs.readdirSync(fullPath, {withFileTypes: true});
		return entries
			.filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
			.map(entry => entry.name)
			.sort();
	} catch {
		return [];
	}
}
