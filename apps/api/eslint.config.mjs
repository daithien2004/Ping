import { defineConfig, globalIgnores } from 'eslint/config';
import base from '@ping/eslint-config';

export default defineConfig([...base, globalIgnores(['dist/**', 'node_modules/**'])]);
