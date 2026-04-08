#!/usr/bin/env node
import React from 'react';
import {render} from 'ink';
import meow from 'meow';
import App from './app.js';

const cli = meow(`
	Usage
	  $ dev-dashboard

	Options
	  --version, -v  Show version
`, {
	importMeta: import.meta,
	flags: {
		version: {
			type: 'boolean',
			alias: 'v'
		}
	}
});

if (cli.flags.version) {
	cli.showVersion();
	process.exit(0);
}

render(<App />, { kittyKeyboard: { mode: 'enabled' } });
