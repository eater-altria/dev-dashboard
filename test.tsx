import React from 'react';
import test from 'ava';
import {render} from 'ink-testing-library';
import App from './source/app.js';

test('renders app with todo tab', t => {
	const {lastFrame} = render(<App />);
	const frame = lastFrame();

	t.truthy(frame?.includes('待办列表'));
	t.truthy(frame?.includes('分支管理'));
});
