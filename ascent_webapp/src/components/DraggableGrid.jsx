import React, { useState, useEffect, useRef } from 'react';
import GridLayout from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

export default function DraggableGrid({ children, layout, onLayoutChange, onDragStop, onResizeStop, cols = 2, rowHeight = 150, className = '' }) {
  const [width, setWidth] = useState(1200);
  const gridRef = useRef(null);

  useEffect(() => {
    const updateWidth = () => {
      if (gridRef.current) {
        setWidth(gridRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  return (
    <div ref={gridRef} style={{ width: '100%' }}>
      <GridLayout
        className={className}
        layout={layout}
        cols={cols}
        rowHeight={rowHeight}
        width={width}
        onLayoutChange={onLayoutChange}
        onDragStop={onDragStop}
        onResizeStop={onResizeStop}
        draggableHandle=".drag-handle"
        compactType={null}
        preventCollision={true}
        isResizable={true}
        isDraggable={true}
      >
        {children}
      </GridLayout>
    </div>
  );
}