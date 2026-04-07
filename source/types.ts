export type Todo = {
	id: string;
	name: string;
	startDate: string; // MMDD format, e.g. "0321"
	endDate: string; // MMDD format, e.g. "0324"
	completed: boolean;
};

export type Branch = {
	id: string;
	repo: string;
	branch: string;
	description: string;
};

export type StoreData = {
	todos: Todo[];
	branches: Branch[];
	projectDir?: string;
	globalCommands?: string[];
};
