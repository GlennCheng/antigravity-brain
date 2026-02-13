"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const BrainManager_1 = require("./src/brain/BrainManager");
function main() {
    return __awaiter(this, void 0, void 0, function* () {
        // Use the actual brain directory from the user
        // The user's brain is at /home/glenn/.gemini/antigravity/brain
        // or we can test on the project itself
        // Let's test on the brain directory we are in: /home/glenn/.gemini/antigravity/brain
        const brainPath = '/home/glenn/.gemini/antigravity/brain/6fdb4904-417e-4ef5-b91b-0341d4725a06';
        console.log(`Testing BrainManager on: ${brainPath}`);
        const manager = new BrainManager_1.BrainManager(brainPath);
        try {
            const graph = yield manager.buildGraph();
            console.log('Graph built successfully!');
            console.log('Nodes:', graph.nodes.map(n => n.name));
            console.log('Links:', graph.links);
        }
        catch (e) {
            console.error('Error building graph:', e);
        }
    });
}
main();
//# sourceMappingURL=test-brain.js.map