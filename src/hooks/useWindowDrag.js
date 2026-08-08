import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 窗口拖拽Hook
 * 处理窗口拖拽功能
 */
export const useWindowDrag = () => {
  const [isDragging, setIsDragging] = useState(false);
  const dragStartPos = useRef({ x: 0, y: 0 });
  const hasMoved = useRef(false);

  // 全域 mouseup 監聽：確保在任何地方放開滑鼠都能重置 hasMoved，
  // 避免在非拖拽區域（如按鈕）放開時 hasMoved 卡在 true 導致點擊失效。
  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isDragging) {
        setIsDragging(false);
      }
      setTimeout(() => {
        hasMoved.current = false;
      }, 100);
    };
    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
  }, [isDragging]);

  const handleMouseDown = useCallback((e) => {
    setIsDragging(true);
    hasMoved.current = false;
    dragStartPos.current = { x: e.clientX, y: e.clientY };

    // 在Electron环境中启用窗口拖拽
    if (window.electronAPI) {
      // CSS的-webkit-app-region: drag已经在draggable类中设置
      // 这里我们只需要跟踪拖拽状态
    }
  }, []);

  const handleMouseMove = useCallback((e) => {
    if (isDragging) {
      const deltaX = Math.abs(e.clientX - dragStartPos.current.x);
      const deltaY = Math.abs(e.clientY - dragStartPos.current.y);

      // 如果鼠标移动超过5像素，认为是拖拽
      if (deltaX > 5 || deltaY > 5) {
        hasMoved.current = true;
      }
    }
  }, [isDragging]);

  const handleMouseUp = useCallback((e) => {
    setIsDragging(false);

    // 重置拖拽状态
    setTimeout(() => {
      hasMoved.current = false;
    }, 100);
  }, []);

  const handleClick = useCallback((e) => {
    // 如果发生了拖拽，阻止点击事件
    if (hasMoved.current) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
    return true;
  }, []);

  return {
    isDragging,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleClick
  };
};