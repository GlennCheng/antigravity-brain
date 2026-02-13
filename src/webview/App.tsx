import React, { useCallback } from 'react';
import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Position,
  NodeTypes
} from 'reactflow';
import dagre from 'dagre';
import FileNode from './components/FileNode';

import 'reactflow/dist/style.css';

const nodeTypes: NodeTypes = {
  fileNode: FileNode,
};

const dagreGraph = new dagre.graphlib.Graph();
dagreGraph.setDefaultEdgeLabel(() => ({}));

const nodeWidth = 172;
const nodeHeight = 36;

const getLayoutedElements = (nodes: Node[], edges: Edge[], direction = 'LR') => {
  const isHorizontal = direction === 'LR';
  dagreGraph.setGraph({ rankdir: direction });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    node.targetPosition = isHorizontal ? Position.Left : Position.Top;
    node.sourcePosition = isHorizontal ? Position.Right : Position.Bottom;

    // We are shifting the dagre node position (anchor=center center) to the top left
    // so it matches the React Flow node anchor point (top left).
    node.position = {
      x: nodeWithPosition.x - nodeWidth / 2,
      y: nodeWithPosition.y - nodeHeight / 2,
    };

    return node;
  });

  return { nodes, edges };
};

const initialNodes: Node[] = [
  { id: '1', position: { x: 0, y: 0 }, data: { label: 'Auth System' } },
  { id: '2', position: { x: 0, y: 100 }, data: { label: 'Login API' } },
];
const initialEdges: Edge[] = [{ id: 'e1-2', source: '1', target: '2' }];

export default function App() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges]
  );
  
  // Listen for messages from the extension
  React.useEffect(() => {
      window.addEventListener('message', event => {
          const message = event.data;
          if (message.type === 'updateGraph') {
               const { nodes, links } = message.data;
               // Transform BrainGraph to ReactFlow elements
               let newNodes: Node[] = nodes.map((n: any, index: number) => ({
                   id: n.id,
                   type: 'fileNode',
                   position: { x: 0, y: 0 }, // Will be set by dagre
                   data: { label: n.name, type: 'Markdown' }
               }));
               
               let newEdges: Edge[] = links.map((l: any, index: number) => ({
                   id: `e-${index}`,
                   source: l.source,
                   target: l.target
               }));
               
               const layouted = getLayoutedElements(newNodes, newEdges);
               setNodes([...layouted.nodes]);
               setEdges([...layouted.edges]);
          }
      });
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background gap={12} size={1} />
      </ReactFlow>
    </div>
  );
}
