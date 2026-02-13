import { BrainManager } from './brain/BrainManager';
import * as path from 'path';
import * as os from 'os';

async function main() {
    // Use the actual brain directory from the user
    // The user's brain is at /home/glenn/.gemini/antigravity/brain
    // or we can test on the project itself
    
    // Let's test on the brain directory we are in: /home/glenn/.gemini/antigravity/brain
    const brainPath = '/home/glenn/.gemini/antigravity/brain/6fdb4904-417e-4ef5-b91b-0341d4725a06'; 
    console.log(`Testing BrainManager on: ${brainPath}`);

    const manager = new BrainManager(brainPath);
    try {
        const graph = await manager.buildGraph();
        console.log('Graph built successfully!');
        console.log('Nodes:', graph.nodes.map(n => n.name));
        console.log('Links:', graph.links);
    } catch (e) {
        console.error('Error building graph:', e);
    }
}

main();
