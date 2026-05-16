import { pathToFileURL } from 'url';
import { resolve } from 'path';
console.log('meta:', import.meta.url);
const entry = process.argv[1];
console.log('file:', pathToFileURL(resolve(entry)).href);
console.log('match:', import.meta.url === pathToFileURL(resolve(entry)).href);
