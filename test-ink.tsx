import React, {useState} from 'react';
import {render, Box, Text, useInput} from 'ink';

function App() {
	const [offset, setOffset] = useState(0);
	useInput((input, key) => {
		if (key.upArrow) setOffset(o => Math.max(0, o - 1));
		if (key.downArrow) setOffset(o => o + 1);
	});
	return (
		<Box flexDirection="column" borderStyle="round" height={10} width={40}>
			<Box flexDirection="column" marginTop={-offset}>
				{Array.from({length: 20}).map((_, i) => (
					<Text key={i}>Line {i}</Text>
				))}
			</Box>
		</Box>
	);
}

render(<App />);
