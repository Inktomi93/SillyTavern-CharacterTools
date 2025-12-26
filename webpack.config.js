import path from 'node:path';
import { fileURLToPath } from 'node:url';
import TerserPlugin from 'terser-webpack-plugin';

const __dirname =
  import.meta.dirname ?? path.dirname(fileURLToPath(import.meta.url));

export default {
    mode: 'production',
    devtool: 'source-map', // Optional: generates .map file for debugging
    entry: path.join(__dirname, 'src/index.ts'),
    output: {
        path: path.join(__dirname, 'dist/'),
        filename: 'index.js',
    },
    resolve: {
        extensions: ['.ts', '.js'],
    },
    module: {
        rules: [
            {
                test: /\.ts$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
        ],
    },
    optimization: {
        minimizer: [
            new TerserPlugin({
                extractComments: false,
                terserOptions: {
                    format: {
                        comments: false,
                    },
                },
            }),
        ],
    },
};
