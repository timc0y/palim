import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {buildBook} from '../src/book.js';
const manuscript=JSON.parse(await readFile(new URL('../examples/first-edition.json',import.meta.url),'utf8')) as unknown;
const book=await buildBook(manuscript,new Map(),new Date('2026-10-25T00:00:00Z'));
await mkdir('artifacts',{recursive:true});await mkdir('public',{recursive:true});
await Promise.all([writeFile('artifacts/palim-sample.epub',book.bytes),writeFile('artifacts/palim-sample.html',book.preview),writeFile('artifacts/manuscript.json',book.source),writeFile('public/sample.epub',book.bytes),writeFile('public/sample.html',book.preview),writeFile('public/example.json',book.source)]);
console.log(JSON.stringify({file:'artifacts/palim-sample.epub',bytes:book.bytes.length,sha256:book.hash,wordCount:book.wordCount,warnings:book.warnings},null,2));
