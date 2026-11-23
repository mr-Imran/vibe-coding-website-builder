import { startPage } from './shell.js';

const user = await startPage();
document.getElementById('greeting').textContent = `Hello, ${user.name}`;
