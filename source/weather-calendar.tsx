import axios from 'axios';
import React, {useState, useEffect, useCallback} from 'react';
import {Box, Text, useInput} from 'ink';
import TextInput from 'ink-text-input';
import {Lunar, Solar} from 'lunar-typescript';
import {type AmapWeatherConfig, type StoreData} from './types.js';
import {loadData, saveData} from './store.js';

type Props = {
	readonly isActive: boolean;
	readonly onFormModeChange: (inForm: boolean) => void;
};

type DayForecast = {
	date: string;
	weekday: string;
	dayWeather: string;
	nightWeather: string;
	dayTemp: string;
	nightTemp: string;
	dayWind: string;
	dayPower: string;
};

type WeatherState =
	| {kind: 'loading'}
	| {kind: 'ok'; city: string; province: string; days: DayForecast[]}
	| {kind: 'error'; message: string};

type SetupMode = 'view' | 'key-input' | 'city-input' | 'searching';

const weekdayLabels = [
	'',
	'周一',
	'周二',
	'周三',
	'周四',
	'周五',
	'周六',
	'周日',
];

function toWeekday(week: string): string {
	const index = Number(week);
	return weekdayLabels[index] ?? `周${week}`;
}

function weatherArt(weather: string): string[] {
	if (weather.includes('晴')) {
		return [
			'    \\   /    ',
			'     .-.     ',
			'  ― (   ) ―  ',
			'     `-᾿     ',
			'    /   \\    ',
		];
	}

	if (weather.includes('多云') || weather.includes('少云')) {
		return [
			'             ',
			'   \\  /      ',
			' _ /"".--.   ',
			'   \\_(   ).  ',
			'   /(___(__) ',
		];
	}

	if (weather.includes('阴')) {
		return [
			'             ',
			'    .--.     ',
			' .-(    ).   ',
			'(___.__)__)  ',
			'             ',
		];
	}

	if (weather.includes('雾') || weather.includes('霾')) {
		return [
			'             ',
			' _ - _ - _ - ',
			'  _ - _ - _  ',
			' _ - _ - _ - ',
			'             ',
		];
	}

	if (weather.includes('雷')) {
		return [
			'   .-.       ',
			'  (   ).     ',
			' (___(__)    ',
			'  ⚡‚ʻ⚡‚ʻ   ',
			'  ‚ʻ‚ʻ‚ʻ    ',
		];
	}

	if (weather.includes('暴雨') || weather.includes('大雨')) {
		return [
			'   .-.       ',
			'  (   ).     ',
			' (___(__)    ',
			' ‚ʻ‚ʻ‚ʻ‚ʻ   ',
			' ‚ʻ‚ʻ‚ʻ‚ʻ   ',
		];
	}

	if (weather.includes('雨')) {
		return [
			'   .-.       ',
			'  (   ).     ',
			' (___(__)    ',
			'  ᾿ ᾿ ᾿ ᾿   ',
			' ᾿ ᾿ ᾿ ᾿    ',
		];
	}

	if (weather.includes('暴雪') || weather.includes('大雪')) {
		return [
			'   .-.       ',
			'  (   ).     ',
			' (___(__)    ',
			' * * * * *   ',
			' * * * * *   ',
		];
	}

	if (weather.includes('雪')) {
		return [
			'   .-.       ',
			'  (   ).     ',
			' (___(__)    ',
			'  *  *  *    ',
			' *  *  *     ',
		];
	}

	return [
		'             ',
		'    .--.     ',
		' .-(    ).   ',
		'(___.__)__)  ',
		'             ',
	];
}

async function httpGetJson(url: string): Promise<unknown> {
	const response = await axios.get(url);
	return response.data;
}

type GeoResponse = {
	status: string;
	geocodes?: Array<{
		formatted_address: string;
		city: string;
		adcode: string;
	}>;
};

type WeatherResponse = {
	status: string;
	forecasts?: Array<{
		city: string;
		province: string;
		casts: Array<{
			date: string;
			week: string;
			dayweather: string;
			nightweather: string;
			daytemp: string;
			nighttemp: string;
			daywind: string;
			daypower: string;
		}>;
	}>;
};

async function geocodeCity(
	key: string,
	address: string,
): Promise<{cityName: string; adcode: string} | undefined> {
	const encoded = encodeURIComponent(address);
	const data = (await httpGetJson(
		`https://restapi.amap.com/v3/geocode/geo?key=${key}&address=${encoded}`,
	)) as GeoResponse;
	if (data.status !== '1' || !data.geocodes?.[0]) {
		return undefined;
	}

	const geo = data.geocodes[0];
	return {
		cityName: geo.city || geo.formatted_address,
		adcode: geo.adcode,
	};
}

async function fetchAmapWeather(
	key: string,
	adcode: string,
): Promise<{city: string; province: string; days: DayForecast[]}> {
	const data = (await httpGetJson(
		`https://restapi.amap.com/v3/weather/weatherInfo?key=${key}&city=${adcode}&extensions=all`,
	)) as WeatherResponse;
	if (data.status !== '1' || !data.forecasts?.[0]) {
		throw new Error('天气查询失败，请检查 Key 或城市编码');
	}

	const forecast = data.forecasts[0];
	const days: DayForecast[] = [];
	for (const cast of forecast.casts) {
		days.push({
			date: cast.date,
			weekday: toWeekday(cast.week),
			dayWeather: cast.dayweather,
			nightWeather: cast.nightweather,
			dayTemp: cast.daytemp,
			nightTemp: cast.nighttemp,
			dayWind: cast.daywind,
			dayPower: cast.daypower,
		});
	}

	return {city: forecast.city, province: forecast.province, days};
}

function getLunarInfo(): string {
	const now = new Date();
	const solar = Solar.fromDate(now);
	const lunar = Lunar.fromSolar(solar);
	const ganZhi = `${lunar.getYearInGanZhi()}年 ${lunar.getYearShengXiao()}`;
	return `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}  ${ganZhi}`;
}

function formatTime(date: Date): string {
	const h = String(date.getHours()).padStart(2, '0');
	const m = String(date.getMinutes()).padStart(2, '0');
	const s = String(date.getSeconds()).padStart(2, '0');
	return `${h}:${m}:${s}`;
}

const weekdayNames = ['日', '一', '二', '三', '四', '五', '六'];

function formatDate(date: Date): string {
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, '0');
	const d = String(date.getDate()).padStart(2, '0');
	const wd = `周${weekdayNames[date.getDay()]!}`;
	return `${y}年${m}月${d}日 ${wd}`;
}

function formatTodayIso(): string {
	const d = new Date();
	const y = d.getFullYear();
	const m = String(d.getMonth() + 1).padStart(2, '0');
	const day = String(d.getDate()).padStart(2, '0');
	return `${y}-${m}-${day}`;
}

export default function WeatherCalendarTab({
	isActive,
	onFormModeChange,
}: Props) {
	const [storeData, setStoreData] = useState<StoreData | undefined>(undefined);
	const [config, setConfig] = useState<AmapWeatherConfig | undefined>(
		undefined,
	);
	const [weather, setWeather] = useState<WeatherState>({kind: 'loading'});
	const [now, setNow] = useState(new Date());
	const [mode, setMode] = useState<SetupMode>('view');
	const [keyInput, setKeyInput] = useState('');
	const [cityInput, setCityInput] = useState('');
	const [setupError, setSetupError] = useState('');
	const [pendingKey, setPendingKey] = useState('');

	useEffect(() => {
		const data = loadData();
		setStoreData(data);
		if (data.amapWeather) {
			setConfig(data.amapWeather);
		} else {
			setMode('key-input');
		}
	}, []);

	const isFormMode = mode === 'key-input' || mode === 'city-input';

	useEffect(() => {
		onFormModeChange(isFormMode);
	}, [isFormMode, onFormModeChange]);

	useEffect(() => {
		if (!isActive) {
			return;
		}

		const id = setInterval(() => {
			setNow(new Date());
		}, 1000);
		return () => {
			clearInterval(id);
		};
	}, [isActive]);

	const persistConfig = useCallback(
		(newConfig: AmapWeatherConfig) => {
			setConfig(newConfig);
			if (storeData) {
				const next = {...storeData, amapWeather: newConfig};
				setStoreData(next);
				saveData(next);
			}
		},
		[storeData],
	);

	useEffect(() => {
		if (!config || !isActive) {
			return;
		}

		let cancelled = false;
		setWeather({kind: 'loading'});

		const load = async () => {
			try {
				const result = await fetchAmapWeather(config.key, config.adcode);
				if (!cancelled) {
					setWeather({kind: 'ok', ...result});
				}
			} catch (error: unknown) {
				if (!cancelled) {
					setWeather({
						kind: 'error',
						message: error instanceof Error ? error.message : String(error),
					});
				}
			}
		};

		void load();
		const id = setInterval(load, 10 * 60 * 1000);
		return () => {
			cancelled = true;
			clearInterval(id);
		};
	}, [config, isActive]);

	const handleCitySubmit = useCallback(
		async (value: string) => {
			const trimmed = value.trim();
			if (!trimmed) {
				return;
			}

			setMode('searching');
			setSetupError('');
			try {
				const result = await geocodeCity(pendingKey, trimmed);
				if (result) {
					const newConfig: AmapWeatherConfig = {
						key: pendingKey,
						cityName: result.cityName,
						adcode: result.adcode,
					};
					persistConfig(newConfig);
					setMode('view');
				} else {
					setSetupError(`未找到「${trimmed}」，请重试`);
					setMode('city-input');
				}
			} catch (error: unknown) {
				setSetupError(error instanceof Error ? error.message : String(error));
				setMode('city-input');
			}
		},
		[pendingKey, persistConfig],
	);

	useInput(
		(input, key) => {
			if (key.escape) {
				if (config) {
					setMode('view');
				}

				return;
			}

			if (input === 'c') {
				setPendingKey(config?.key ?? '');
				setCityInput('');
				setSetupError('');
				setMode('city-input');
			} else if (input === 'k') {
				setKeyInput(config?.key ?? '');
				setCityInput('');
				setSetupError('');
				setMode('key-input');
			}
		},
		{isActive: isActive && mode === 'view'},
	);

	useInput(
		(_input, key) => {
			if (key.escape && config) {
				setMode('view');
			}
		},
		{isActive: isActive && isFormMode},
	);

	// --- Key input ---
	if (mode === 'key-input') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						🔑 设置高德地图 API Key
					</Text>
				</Box>
				<Box>
					<Text color="cyan">Key: </Text>
					<TextInput
						value={keyInput}
						onChange={setKeyInput}
						onSubmit={value => {
							if (value.trim()) {
								setPendingKey(value.trim());
								setCityInput('');
								setMode('city-input');
							}
						}}
					/>
				</Box>
				<Box marginTop={1}>
					<Text dimColor>
						请输入高德 Web 服务 API Key Enter 下一步
						{config ? ' Esc 返回' : ''}
					</Text>
				</Box>
			</Box>
		);
	}

	// --- City input ---
	if (mode === 'city-input' || mode === 'searching') {
		return (
			<Box flexDirection="column" paddingX={2}>
				<Box marginBottom={1}>
					<Text bold color="cyan">
						🏙️ 设置城市
					</Text>
				</Box>
				{mode === 'searching' ? (
					<Text dimColor>正在查询…</Text>
				) : (
					<>
						<Box>
							<Text color="cyan">城市名称: </Text>
							<TextInput
								value={cityInput}
								onChange={setCityInput}
								onSubmit={value => {
									void handleCitySubmit(value);
								}}
							/>
						</Box>
						{setupError && (
							<Box marginTop={1}>
								<Text color="red">{setupError}</Text>
							</Box>
						)}
						<Box marginTop={1}>
							<Text dimColor>
								输入城市名 Enter 确认
								{config ? ' Esc 返回' : ''}
							</Text>
						</Box>
					</>
				)}
			</Box>
		);
	}

	// --- View mode ---
	const dateString = formatDate(now);
	const timeString = formatTime(now);
	const lunarString = getLunarInfo();
	const todayIso = formatTodayIso();

	return (
		<Box flexDirection="column" paddingX={2}>
			<Box flexDirection="column" marginBottom={1}>
				<Box>
					<Text bold color="cyan">
						📅 {dateString}
					</Text>
					<Text bold color="yellow">
						{'  '}
						{timeString}
					</Text>
				</Box>
				<Text color="magenta">{`   ${lunarString}`}</Text>
			</Box>

			<Box marginBottom={1}>
				<Text bold color="green">
					📍 {config?.cityName ?? ''}
				</Text>
			</Box>

			{weather.kind === 'loading' && <Text dimColor>正在加载天气数据…</Text>}

			{weather.kind === 'error' && (
				<Text color="red">天气加载失败: {weather.message}</Text>
			)}

			{weather.kind === 'ok' && (
				<Box flexDirection="column">
					<Text bold>
						{`🌤️ ${weather.province} · ${weather.city} 天气预报`}
					</Text>
					<Box marginTop={1}>
						{weather.days.map(day => {
							const art = weatherArt(day.dayWeather);
							const isToday = day.date === todayIso;
							return (
								<Box key={day.date} flexDirection="column" marginRight={1}>
									<Text bold={isToday} color={isToday ? 'cyan' : 'white'}>
										{isToday ? '▸ ' : '  '}
										{day.date.slice(5)} {day.weekday}
									</Text>
									{art.map((line, index) => (
										<Text key={`${day.date}-${String(index)}`} color="yellow">
											{line}
										</Text>
									))}
									<Text bold>{day.dayWeather}</Text>
									<Text>
										<Text color="red">{day.dayTemp}°</Text>
										<Text dimColor> / </Text>
										<Text color="blue">{day.nightTemp}°</Text>
									</Text>
									<Text dimColor>
										{day.dayWind}风 {day.dayPower}
									</Text>
								</Box>
							);
						})}
					</Box>
				</Box>
			)}

			<Box marginTop={1}>
				<Text dimColor>c 切换城市 k 修改Key 天气约10分钟刷新</Text>
			</Box>
		</Box>
	);
}
