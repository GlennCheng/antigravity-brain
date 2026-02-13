import React, { memo } from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

const FileNode = ({ data }: NodeProps) => {
  return (
    <div style={{ 
        padding: '10px', 
        borderRadius: '5px', 
        background: '#252526', 
        color: '#ccc', 
        border: '1px solid #3c3c3c',
        width: '150px',
        fontSize: '12px',
        textAlign: 'center'
    }}>
      <Handle type="target" position={Position.Top} style={{ background: '#555' }} />
      <div style={{ marginBottom: '5px' }}>
        <strong>{data.label}</strong>
      </div>
      <div style={{ fontSize: '10px', color: '#888' }}>
        {data.type || 'File'}
      </div>
      <Handle type="source" position={Position.Bottom} style={{ background: '#555' }} />
    </div>
  );
};

export default memo(FileNode);
