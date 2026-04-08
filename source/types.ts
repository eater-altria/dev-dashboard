export type Todo = {
	id: string;
	name: string;
	startDate: string; // MMDD format, e.g. "0321"
	endDate: string; // MMDD format, e.g. "0324"
	completed: boolean;
	context?: string;
};

export type Branch = {
	id: string;
	repo: string;
	branch: string;
	description: string;
};

export type RssFeed = {
	id: string;
	name: string;
	url: string;
};

export type AmapWeatherConfig = {
	key: string;
	cityName: string;
	adcode: string;
};

export type StoreData = {
	todos: Todo[];
	branches: Branch[];
	projectDir?: string;
	globalCommands?: string[];
	rssFeeds?: RssFeed[];
	amapWeather?: AmapWeatherConfig;
};
