"use client"

import { useEffect, useRef, useState, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { X, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'

interface FullscreenImageViewerProps {
  canvas: HTMLCanvasElement | null
  isOpen: boolean
  onClose: () => void
}

export function FullscreenImageViewer({ canvas, isOpen, onClose }: FullscreenImageViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [lastPanPoint, setLastPanPoint] = useState({ x: 0, y: 0 })

  // 重置视图状态
  const resetView = useCallback(() => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
    setIsDragging(false)
  }, [])

  // 处理缩放
  const handleZoom = useCallback((delta: number, clientX?: number, clientY?: number) => {
    if (!containerRef.current || !canvasRef.current) return

    const container = containerRef.current
    const rect = container.getBoundingClientRect()
    
    // 计算缩放中心点
    const centerX = clientX !== undefined ? clientX - rect.left : rect.width / 2
    const centerY = clientY !== undefined ? clientY - rect.top : rect.height / 2

    const newScale = Math.max(0.1, Math.min(10, scale + delta))
    const scaleDiff = newScale - scale

    // 调整位置以保持缩放中心点不变
    const newX = position.x - (centerX - rect.width / 2) * scaleDiff / scale
    const newY = position.y - (centerY - rect.height / 2) * scaleDiff / scale

    setScale(newScale)
    setPosition({ x: newX, y: newY })
  }, [scale, position])

  // 鼠标滚轮缩放
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.1 : 0.1
    handleZoom(delta, e.clientX, e.clientY)
  }, [handleZoom])

  // 鼠标拖动开始
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return // 只处理左键
    setIsDragging(true)
    setDragStart({ x: e.clientX, y: e.clientY })
    setLastPanPoint({ x: position.x, y: position.y })
  }, [position])

  // 鼠标拖动
  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (!isDragging) return
    
    const deltaX = e.clientX - dragStart.x
    const deltaY = e.clientY - dragStart.y
    
    setPosition({
      x: lastPanPoint.x + deltaX,
      y: lastPanPoint.y + deltaY
    })
  }, [isDragging, dragStart, lastPanPoint])

  // 鼠标拖动结束
  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // 触摸事件处理
  const [touches, setTouches] = useState<TouchList | null>(null)
  const [lastTouchDistance, setLastTouchDistance] = useState(0)

  const getTouchDistance = (touches: TouchList) => {
    if (touches.length < 2) return 0
    const touch1 = touches[0]
    const touch2 = touches[1]
    return Math.sqrt(
      Math.pow(touch2.clientX - touch1.clientX, 2) + 
      Math.pow(touch2.clientY - touch1.clientY, 2)
    )
  }

  const getTouchCenter = (touches: TouchList) => {
    if (touches.length === 1) {
      return { x: touches[0].clientX, y: touches[0].clientY }
    }
    const touch1 = touches[0]
    const touch2 = touches[1]
    return {
      x: (touch1.clientX + touch2.clientX) / 2,
      y: (touch1.clientY + touch2.clientY) / 2
    }
  }

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    setTouches(e.touches)
    
    if (e.touches.length === 1) {
      // 单指拖动
      setIsDragging(true)
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY })
      setLastPanPoint({ x: position.x, y: position.y })
    } else if (e.touches.length === 2) {
      // 双指缩放
      setIsDragging(false)
      setLastTouchDistance(getTouchDistance(e.touches))
    }
  }, [position])

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    e.preventDefault()
    
    if (e.touches.length === 1 && isDragging) {
      // 单指拖动
      const deltaX = e.touches[0].clientX - dragStart.x
      const deltaY = e.touches[0].clientY - dragStart.y
      
      setPosition({
        x: lastPanPoint.x + deltaX,
        y: lastPanPoint.y + deltaY
      })
    } else if (e.touches.length === 2) {
      // 双指缩放
      const currentDistance = getTouchDistance(e.touches)
      const center = getTouchCenter(e.touches)
      
      if (lastTouchDistance > 0) {
        const scaleDelta = (currentDistance - lastTouchDistance) * 0.01
        handleZoom(scaleDelta, center.x, center.y)
      }
      
      setLastTouchDistance(currentDistance)
    }
  }, [isDragging, dragStart, lastPanPoint, lastTouchDistance, handleZoom])

  const handleTouchEnd = useCallback(() => {
    setIsDragging(false)
    setTouches(null)
    setLastTouchDistance(0)
  }, [])

  // 键盘事件处理
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (!isOpen) return
    
    switch (e.key) {
      case 'Escape':
        onClose()
        break
      case '+':
      case '=':
        handleZoom(0.1)
        break
      case '-':
        handleZoom(-0.1)
        break
      case '0':
        resetView()
        break
    }
  }, [isOpen, onClose, handleZoom, resetView])

  // 事件监听器设置
  useEffect(() => {
    if (!isOpen) return

    const container = containerRef.current
    if (!container) return

    // 添加事件监听器
    container.addEventListener('wheel', handleWheel, { passive: false })
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      container.removeEventListener('wheel', handleWheel)
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, handleWheel, handleMouseMove, handleMouseUp, handleKeyDown])

  // 重置视图当打开新图片时
  useEffect(() => {
    if (isOpen && canvas) {
      resetView()
    }
  }, [isOpen, canvas, resetView])

  // 绘制canvas
  useEffect(() => {
    if (!canvas || !canvasRef.current) return

    const ctx = canvasRef.current.getContext('2d')
    if (!ctx) return

    canvasRef.current.width = canvas.width
    canvasRef.current.height = canvas.height
    ctx.drawImage(canvas, 0, 0)
  }, [canvas])

  if (!isOpen || !canvas) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-90 z-50 flex items-center justify-center">
      {/* 控制栏 */}
      <div className="absolute top-4 left-1/2 transform -translate-x-1/2 flex items-center gap-2 bg-black bg-opacity-50 rounded-lg p-2 z-10">
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white hover:bg-opacity-20"
          onClick={() => handleZoom(0.1)}
        >
          <ZoomIn className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white hover:bg-opacity-20"
          onClick={() => handleZoom(-0.1)}
        >
          <ZoomOut className="w-4 h-4" />
        </Button>
        <Button
          size="sm"
          variant="ghost"
          className="text-white hover:bg-white hover:bg-opacity-20"
          onClick={resetView}
        >
          <RotateCcw className="w-4 h-4" />
        </Button>
        <div className="text-white text-sm px-2">
          {Math.round(scale * 100)}%
        </div>
      </div>

      {/* 关闭按钮 */}
      <Button
        size="sm"
        variant="ghost"
        className="absolute top-4 right-4 text-white hover:bg-white hover:bg-opacity-20 z-10"
        onClick={onClose}
      >
        <X className="w-6 h-6" />
      </Button>

      {/* 图片容器 */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
            transformOrigin: 'center center',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out'
          }}
        >
          <canvas
            ref={canvasRef}
            className="max-w-none max-h-none"
            style={{ 
              imageRendering: scale > 2 ? 'pixelated' : 'auto'
            }}
          />
        </div>
      </div>

      {/* 使用说明 */}
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 text-white text-sm bg-black bg-opacity-50 rounded-lg px-4 py-2">
        <div className="text-center">
          <div>拖动: 鼠标拖拽 / 单指滑动</div>
          <div>缩放: 滚轮 / 双指捏合 / +/- 键</div>
          <div>重置: R键 / 点击重置按钮</div>
          <div>退出: ESC键 / 点击关闭按钮</div>
        </div>
      </div>
    </div>
  )
}
