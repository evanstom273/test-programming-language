import { parentPort, workerData } from 'node:worker_threads';
import { analyzeProject } from '../../../src/language/analysis';
parentPort!.postMessage(analyzeProject(workerData));
