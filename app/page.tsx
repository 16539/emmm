"use client"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Upload, Download, RotateCcw, Maximize2, Loader2, Info, Wrench, Search } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { FullscreenImageViewer } from "@/components/fullscreen-image-viewer"

interface ImageData {
  file: File | null
  canvas: HTMLCanvasElement | null
  originalCanvas: HTMLCanvasElement | null
  histogram: number[]
}

interface ImageSettings {
  outputLevelsMin: number
  outputLevelsMax: number
  exposure: number
  brightness: number
  contrast: number
}

interface ParseSettings {
  exposure: number
  brightness: number
  contrast: number
}

export default function PrismTankGenerator() {
  const { toast } = useToast()
  const [surfaceImage, setSurfaceImage] = useState<ImageData>({
    file: null,
    canvas: null,
    originalCanvas: null,
    histogram: new Array(256).fill(0),
  })
  const [innerImage, setInnerImage] = useState<ImageData>({
    file: null,
    canvas: null,
    originalCanvas: null,
    histogram: new Array(256).fill(0),
  })

  const [surfaceSettings, setSurfaceSettings] = useState<ImageSettings>({
    outputLevelsMin: 25,
    outputLevelsMax: 255,
    exposure: 0,
    brightness: 0,
    contrast: 0,
  })

  const [innerSettings, setInnerSettings] = useState<ImageSettings>({
    outputLevelsMin: 0,
    outputLevelsMax: 25,
    exposure: 0,
    brightness: 0,
    contrast: 0,
  })

  // 添加临时设置状态，用于实时显示滑块值但不立即处理
  const [tempSurfaceSettings, setTempSurfaceSettings] = useState<ImageSettings>(surfaceSettings)
  const [tempInnerSettings, setTempInnerSettings] = useState<ImageSettings>(innerSettings)

  const [outputCanvas, setOutputCanvas] = useState<HTMLCanvasElement | null>(null)
  const [recoveryCanvas, setRecoveryCanvas] = useState<HTMLCanvasElement | null>(null)
  const [recoverySettings, setRecoverySettings] = useState({
    exposure: 2,
    brightness: 80,
    contrast: 100,
  })
  const [tempRecoverySettings, setTempRecoverySettings] = useState(recoverySettings)

  // 添加分割精度设置
  const [splitPrecision, setSplitPrecision] = useState(1)
  const [tempSplitPrecision, setTempSplitPrecision] = useState(1)

  // 解析页面相关状态
  const [parseImage, setParseImage] = useState<ImageData>({
    file: null,
    canvas: null,
    originalCanvas: null,
    histogram: new Array(256).fill(0),
  })
  const [parsedCanvas, setParsedCanvas] = useState<HTMLCanvasElement | null>(null)
  const [parseSettings, setParseSettings] = useState<ParseSettings>({
    exposure: 2,
    brightness: 80,
    contrast: 100,
  })
  const [tempParseSettings, setTempParseSettings] = useState<ParseSettings>(parseSettings)
  const [innerPosition, setInnerPosition] = useState<"odd" | "even">("odd") // 里图位置：奇数或偶数棋盘
  const [parsePrecision, setParsePrecision] = useState(1)
  const [tempParsePrecision, setTempParsePrecision] = useState(1)

  // 添加处理状态
  const [isProcessingSurface, setIsProcessingSurface] = useState(false)
  const [isProcessingInner, setIsProcessingInner] = useState(false)
  const [isProcessingRecovery, setIsProcessingRecovery] = useState(false)
  const [isProcessingOutput, setIsProcessingOutput] = useState(false)
  const [isProcessingParse, setIsProcessingParse] = useState(false)

  const processingTimeoutRef = useRef<NodeJS.Timeout>()
  const surfaceTimeoutRef = useRef<NodeJS.Timeout>()
  const innerTimeoutRef = useRef<NodeJS.Timeout>()
  const recoveryTimeoutRef = useRef<NodeJS.Timeout>()
  const splitTimeoutRef = useRef<NodeJS.Timeout>()
  const parseTimeoutRef = useRef<NodeJS.Timeout>()
  const parsePrecisionTimeoutRef = useRef<NodeJS.Timeout>()
  const [fullscreenImage, setFullscreenImage] = useState<HTMLCanvasElement | null>(null)
  const [isFullscreenOpen, setIsFullscreenOpen] = useState(false)

  // 计算直方图
  const calculateHistogram = useCallback((canvas: HTMLCanvasElement) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return new Array(256).fill(0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const histogram = new Array(256).fill(0)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2])
      histogram[gray]++
    }

    return histogram
  }, [])

  // 应用图像调整
  const applyImageAdjustments = useCallback((canvas: HTMLCanvasElement, settings: ImageSettings | ParseSettings) => {
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]

      // 应用色阶调整（仅对ImageSettings）
      if ("outputLevelsMin" in settings && "outputLevelsMax" in settings) {
        r = Math.max(
          0,
          Math.min(255, (r / 255) * (settings.outputLevelsMax - settings.outputLevelsMin) + settings.outputLevelsMin),
        )
        g = Math.max(
          0,
          Math.min(255, (g / 255) * (settings.outputLevelsMax - settings.outputLevelsMin) + settings.outputLevelsMin),
        )
        b = Math.max(
          0,
          Math.min(255, (b / 255) * (settings.outputLevelsMax - settings.outputLevelsMin) + settings.outputLevelsMin),
        )
      }

      // 应用曝光度
      const exposureFactor = Math.pow(2, settings.exposure)
      r *= exposureFactor
      g *= exposureFactor
      b *= exposureFactor

      // 应用亮度
      r += settings.brightness
      g += settings.brightness
      b += settings.brightness

      // 应用对比度
      const contrastFactor = (259 * (settings.contrast + 255)) / (255 * (259 - settings.contrast))
      r = contrastFactor * (r - 128) + 128
      g = contrastFactor * (g - 128) + 128
      b = contrastFactor * (b - 128) + 128

      // 限制范围
      data[i] = Math.max(0, Math.min(255, r))
      data[i + 1] = Math.max(0, Math.min(255, g))
      data[i + 2] = Math.max(0, Math.min(255, b))
    }

    ctx.putImageData(imageData, 0, 0)
  }, [])

  // 缩放图像到目标尺寸
  const resizeCanvas = useCallback((sourceCanvas: HTMLCanvasElement, targetWidth: number, targetHeight: number) => {
    const resizedCanvas = document.createElement("canvas")
    const ctx = resizedCanvas.getContext("2d")
    if (!ctx) return sourceCanvas

    resizedCanvas.width = targetWidth
    resizedCanvas.height = targetHeight

    // 使用高质量缩放
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = "high"

    // 绘制缩放后的图像
    ctx.drawImage(sourceCanvas, 0, 0, sourceCanvas.width, sourceCanvas.height, 0, 0, targetWidth, targetHeight)

    return resizedCanvas
  }, [])

  const processImage = useCallback(
    (imageData: ImageData, settings: ImageSettings, updateFunction: (data: ImageData) => void) => {
      if (!imageData.originalCanvas) return

      const canvas = document.createElement("canvas")
      const ctx = canvas.getContext("2d")
      if (!ctx) return

      canvas.width = imageData.originalCanvas.width
      canvas.height = imageData.originalCanvas.height
      ctx.drawImage(imageData.originalCanvas, 0, 0)

      applyImageAdjustments(canvas, settings)
      const histogram = calculateHistogram(canvas)

      updateFunction({
        ...imageData,
        canvas,
        histogram,
      })
    },
    [applyImageAdjustments, calculateHistogram],
  )

  // 解析光棱坦克图片
  const parsePrismTankImage = useCallback(() => {
    if (!parseImage.originalCanvas) return

    const sourceCanvas = parseImage.originalCanvas
    const width = sourceCanvas.width
    const height = sourceCanvas.height

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = width
    canvas.height = height
    ctx.drawImage(sourceCanvas, 0, 0)

    const imageData = ctx.getImageData(0, 0, width, height)
    const data = imageData.data

    // 解析算法：将表图位置的像素替换为周围里图像素的平均值
    const newData = new Uint8ClampedArray(data)

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const gridX = Math.floor(x / parsePrecision)
        const gridY = Math.floor(y / parsePrecision)
        const isInnerPosition = innerPosition === "odd" ? (gridX + gridY) % 2 === 1 : (gridX + gridY) % 2 === 0

        // 如果当前位置是表图位置，需要用周围里图像素的平均值替换
        if (!isInnerPosition) {
          const index = (y * width + x) * 4
          let totalR = 0,
            totalG = 0,
            totalB = 0,
            count = 0

          // 搜索周围的里图像素
          for (let dy = -parsePrecision; dy <= parsePrecision; dy++) {
            for (let dx = -parsePrecision; dx <= parsePrecision; dx++) {
              const nx = x + dx
              const ny = y + dy

              if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
                const nGridX = Math.floor(nx / parsePrecision)
                const nGridY = Math.floor(ny / parsePrecision)
                const nIsInnerPosition =
                  innerPosition === "odd" ? (nGridX + nGridY) % 2 === 1 : (nGridX + nGridY) % 2 === 0

                if (nIsInnerPosition) {
                  const nIndex = (ny * width + nx) * 4
                  totalR += data[nIndex]
                  totalG += data[nIndex + 1]
                  totalB += data[nIndex + 2]
                  count++
                }
              }
            }
          }

          if (count > 0) {
            newData[index] = Math.round(totalR / count)
            newData[index + 1] = Math.round(totalG / count)
            newData[index + 2] = Math.round(totalB / count)
          }
        }
      }
    }

    const newImageData = new ImageData(newData, width, height)
    ctx.putImageData(newImageData, 0, 0)

    // 应用图像调整
    applyImageAdjustments(canvas, parseSettings)
    const histogram = calculateHistogram(canvas)

    setParsedCanvas(canvas)
    setParseImage((prev) => ({
      ...prev,
      canvas,
      histogram,
    }))
  }, [
    parseImage.originalCanvas,
    innerPosition,
    parsePrecision,
    parseSettings,
    applyImageAdjustments,
    calculateHistogram,
  ])

  // 防抖处理表图设置
  const debouncedProcessSurface = useCallback((settings: ImageSettings) => {
    if (surfaceTimeoutRef.current) {
      clearTimeout(surfaceTimeoutRef.current)
    }

    setIsProcessingSurface(true)
    surfaceTimeoutRef.current = setTimeout(() => {
      setSurfaceSettings(settings)
      setIsProcessingSurface(false)
    }, 300)
  }, [])

  // 防抖处理里图设置
  const debouncedProcessInner = useCallback((settings: ImageSettings) => {
    if (innerTimeoutRef.current) {
      clearTimeout(innerTimeoutRef.current)
    }

    setIsProcessingInner(true)
    innerTimeoutRef.current = setTimeout(() => {
      setInnerSettings(settings)
      setIsProcessingInner(false)
    }, 300)
  }, [])

  // 防抖处理恢复设置
  const debouncedProcessRecovery = useCallback((settings: typeof recoverySettings) => {
    if (recoveryTimeoutRef.current) {
      clearTimeout(recoveryTimeoutRef.current)
    }

    setIsProcessingRecovery(true)
    recoveryTimeoutRef.current = setTimeout(() => {
      setRecoverySettings(settings)
      setIsProcessingRecovery(false)
    }, 300)
  }, [])

  // 防抖处理分割精度
  const debouncedProcessSplitPrecision = useCallback((precision: number) => {
    if (splitTimeoutRef.current) {
      clearTimeout(splitTimeoutRef.current)
    }

    setIsProcessingOutput(true)
    splitTimeoutRef.current = setTimeout(() => {
      setSplitPrecision(precision)
      setIsProcessingOutput(false)
    }, 300)
  }, [])

  // 防抖处理解析设置
  const debouncedProcessParse = useCallback((settings: ParseSettings) => {
    if (parseTimeoutRef.current) {
      clearTimeout(parseTimeoutRef.current)
    }

    setIsProcessingParse(true)
    parseTimeoutRef.current = setTimeout(() => {
      setParseSettings(settings)
      setIsProcessingParse(false)
    }, 300)
  }, [])

  // 防抖处理解析精度
  const debouncedProcessParsePrecision = useCallback((precision: number) => {
    if (parsePrecisionTimeoutRef.current) {
      clearTimeout(parsePrecisionTimeoutRef.current)
    }

    setIsProcessingParse(true)
    parsePrecisionTimeoutRef.current = setTimeout(() => {
      setParsePrecision(precision)
      setIsProcessingParse(false)
    }, 300)
  }, [])

  // 处理表图设置变化
  const handleSurfaceSettingsChange = useCallback(
    (newSettings: ImageSettings) => {
      setTempSurfaceSettings(newSettings)
      debouncedProcessSurface(newSettings)
    },
    [debouncedProcessSurface],
  )

  // 处理里图设置变化
  const handleInnerSettingsChange = useCallback(
    (newSettings: ImageSettings) => {
      setTempInnerSettings(newSettings)
      debouncedProcessInner(newSettings)
    },
    [debouncedProcessInner],
  )

  // 处理恢复设置变化
  const handleRecoverySettingsChange = useCallback(
    (newSettings: typeof recoverySettings) => {
      setTempRecoverySettings(newSettings)
      debouncedProcessRecovery(newSettings)
    },
    [debouncedProcessRecovery],
  )

  // 处理分割精度变化
  const handleSplitPrecisionChange = useCallback(
    (precision: number) => {
      setTempSplitPrecision(precision)
      debouncedProcessSplitPrecision(precision)
    },
    [debouncedProcessSplitPrecision],
  )

  // 处理解析设置变化
  const handleParseSettingsChange = useCallback(
    (newSettings: ParseSettings) => {
      setTempParseSettings(newSettings)
      debouncedProcessParse(newSettings)
    },
    [debouncedProcessParse],
  )

  // 处理解析精度变化
  const handleParsePrecisionChange = useCallback(
    (precision: number) => {
      setTempParsePrecision(precision)
      debouncedProcessParsePrecision(precision)
    },
    [debouncedProcessParsePrecision],
  )

  // 处理文件上传
  const handleFileUpload = useCallback(
    (file: File, isSurface: boolean) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement("canvas")
          const originalCanvas = document.createElement("canvas")
          const ctx = canvas.getContext("2d")
          const originalCtx = originalCanvas.getContext("2d")

          if (!ctx || !originalCtx) return

          canvas.width = originalCanvas.width = img.width
          canvas.height = originalCanvas.height = img.height

          ctx.drawImage(img, 0, 0)
          originalCtx.drawImage(img, 0, 0)

          const newImageData = {
            file,
            canvas: document.createElement("canvas"),
            originalCanvas,
            histogram: new Array(256).fill(0),
          }

          // Apply current settings and calculate histogram
          const currentSettings = isSurface ? surfaceSettings : innerSettings
          processImage(newImageData, currentSettings, isSurface ? setSurfaceImage : setInnerImage)

          toast({
            title: "图片上传成功",
            description: `${isSurface ? "表图" : "里图"}已成功加载并处理 (${img.width}×${img.height})`,
          })
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    },
    [processImage, surfaceSettings, innerSettings, toast],
  )

  // 处理解析图片上传
  const handleParseFileUpload = useCallback(
    (file: File) => {
      const reader = new FileReader()
      reader.onload = (e) => {
        const img = new Image()
        img.onload = () => {
          const originalCanvas = document.createElement("canvas")
          const originalCtx = originalCanvas.getContext("2d")

          if (!originalCtx) return

          originalCanvas.width = img.width
          originalCanvas.height = img.height
          originalCtx.drawImage(img, 0, 0)

          const newImageData = {
            file,
            canvas: null,
            originalCanvas,
            histogram: new Array(256).fill(0),
          }

          setParseImage(newImageData)

          toast({
            title: "光棱坦克图片上传成功",
            description: `图片已成功加载 (${img.width}×${img.height})`,
          })
        }
        img.src = e.target?.result as string
      }
      reader.readAsDataURL(file)
    },
    [toast],
  )

  // 合成光棱坦克图片
  const generatePrismTank = useCallback(() => {
    if (!surfaceImage.originalCanvas || !innerImage.originalCanvas) return

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // 以表图的尺寸为基准
    const targetWidth = surfaceImage.originalCanvas.width
    const targetHeight = surfaceImage.originalCanvas.height

    canvas.width = targetWidth
    canvas.height = targetHeight

    // 创建处理后的表图和里图
    const processedSurface = document.createElement("canvas")
    let processedInner = document.createElement("canvas")
    const surfaceCtx = processedSurface.getContext("2d")
    const innerCtx = processedInner.getContext("2d")

    if (!surfaceCtx || !innerCtx) return

    processedSurface.width = targetWidth
    processedSurface.height = targetHeight

    // 处理表图（保持原始尺寸）
    surfaceCtx.drawImage(surfaceImage.originalCanvas, 0, 0)
    applyImageAdjustments(processedSurface, surfaceSettings)

    // 处理里图（先缩放到表图尺寸，再应用调整）
    if (innerImage.originalCanvas.width !== targetWidth || innerImage.originalCanvas.height !== targetHeight) {
      // 需要缩放里图
      processedInner = resizeCanvas(innerImage.originalCanvas, targetWidth, targetHeight)
      applyImageAdjustments(processedInner, innerSettings)
    } else {
      // 尺寸相同，直接处理
      processedInner.width = targetWidth
      processedInner.height = targetHeight
      innerCtx.drawImage(innerImage.originalCanvas, 0, 0)
      applyImageAdjustments(processedInner, innerSettings)
    }

    // 获取图像数据
    const surfaceData = surfaceCtx.getImageData(0, 0, targetWidth, targetHeight)
    const innerData = processedInner.getContext("2d")?.getImageData(0, 0, targetWidth, targetHeight)

    if (!innerData) return

    const outputData = ctx.createImageData(targetWidth, targetHeight)

    // 使用分割精度进行奇偶坐标分割合成
    for (let y = 0; y < targetHeight; y++) {
      for (let x = 0; x < targetWidth; x++) {
        const index = (y * targetWidth + x) * 4
        // 根据分割精度计算棋盘格位置
        const gridX = Math.floor(x / splitPrecision)
        const gridY = Math.floor(y / splitPrecision)
        const isEven = (gridX + gridY) % 2 === 0

        if (isEven) {
          // 使用表图像素
          outputData.data[index] = surfaceData.data[index]
          outputData.data[index + 1] = surfaceData.data[index + 1]
          outputData.data[index + 2] = surfaceData.data[index + 2]
          outputData.data[index + 3] = surfaceData.data[index + 3]
        } else {
          // 使用里图像素
          outputData.data[index] = innerData.data[index]
          outputData.data[index + 1] = innerData.data[index + 1]
          outputData.data[index + 2] = innerData.data[index + 2]
          outputData.data[index + 3] = innerData.data[index + 3]
        }
      }
    }

    ctx.putImageData(outputData, 0, 0)
    setOutputCanvas(canvas)
  }, [surfaceImage, innerImage, surfaceSettings, innerSettings, splitPrecision, applyImageAdjustments, resizeCanvas])

  // 生成恢复预览
  const generateRecoveryPreview = useCallback(() => {
    if (!outputCanvas) return

    const canvas = document.createElement("canvas")
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    canvas.width = outputCanvas.width
    canvas.height = outputCanvas.height
    ctx.drawImage(outputCanvas, 0, 0)

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
    const data = imageData.data

    for (let i = 0; i < data.length; i += 4) {
      let r = data[i]
      let g = data[i + 1]
      let b = data[i + 2]

      // 应用恢复设置
      const exposureFactor = Math.pow(2, recoverySettings.exposure)
      r *= exposureFactor
      g *= exposureFactor
      b *= exposureFactor

      r += recoverySettings.brightness
      g += recoverySettings.brightness
      b += recoverySettings.brightness

      const contrastFactor = (259 * (recoverySettings.contrast + 255)) / (255 * (259 - recoverySettings.contrast))
      r = contrastFactor * (r - 128) + 128
      g = contrastFactor * (g - 128) + 128
      b = contrastFactor * (b - 128) + 128

      data[i] = Math.max(0, Math.min(255, r))
      data[i + 1] = Math.max(0, Math.min(255, g))
      data[i + 2] = Math.max(0, Math.min(255, b))
    }

    ctx.putImageData(imageData, 0, 0)
    setRecoveryCanvas(canvas)
  }, [outputCanvas, recoverySettings])

  // 防抖处理合成
  const debouncedGeneratePrismTank = useCallback(() => {
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current)
    }
    processingTimeoutRef.current = setTimeout(() => {
      generatePrismTank()
    }, 100)
  }, [generatePrismTank])

  // Process surface image when settings change
  useEffect(() => {
    if (surfaceImage.originalCanvas) {
      processImage(surfaceImage, surfaceSettings, setSurfaceImage)
    }
  }, [surfaceSettings, processImage])

  // Process inner image when settings change
  useEffect(() => {
    if (innerImage.originalCanvas) {
      processImage(innerImage, innerSettings, setInnerImage)
    }
  }, [innerSettings, processImage])

  // Generate prism tank when processed images are ready or split precision changes
  useEffect(() => {
    if (surfaceImage.canvas && innerImage.canvas) {
      debouncedGeneratePrismTank()
    }
  }, [surfaceImage.canvas, innerImage.canvas, splitPrecision, debouncedGeneratePrismTank])

  useEffect(() => {
    if (outputCanvas) {
      generateRecoveryPreview()
    }
  }, [outputCanvas, recoverySettings, generateRecoveryPreview])

  // Parse prism tank image when settings change
  useEffect(() => {
    if (parseImage.originalCanvas) {
      parsePrismTankImage()
    }
  }, [parseImage.originalCanvas, innerPosition, parsePrecision, parseSettings, parsePrismTankImage])

  // 同步临时设置到实际设置（用于重置等操作）
  useEffect(() => {
    setTempSurfaceSettings(surfaceSettings)
  }, [surfaceSettings])

  useEffect(() => {
    setTempInnerSettings(innerSettings)
  }, [innerSettings])

  useEffect(() => {
    setTempRecoverySettings(recoverySettings)
  }, [recoverySettings])

  useEffect(() => {
    setTempSplitPrecision(splitPrecision)
  }, [splitPrecision])

  useEffect(() => {
    setTempParseSettings(parseSettings)
  }, [parseSettings])

  useEffect(() => {
    setTempParsePrecision(parsePrecision)
  }, [parsePrecision])

  // 清理定时器
  useEffect(() => {
    return () => {
      if (processingTimeoutRef.current) clearTimeout(processingTimeoutRef.current)
      if (surfaceTimeoutRef.current) clearTimeout(surfaceTimeoutRef.current)
      if (innerTimeoutRef.current) clearTimeout(innerTimeoutRef.current)
      if (recoveryTimeoutRef.current) clearTimeout(recoveryTimeoutRef.current)
      if (splitTimeoutRef.current) clearTimeout(splitTimeoutRef.current)
      if (parseTimeoutRef.current) clearTimeout(parseTimeoutRef.current)
      if (parsePrecisionTimeoutRef.current) clearTimeout(parsePrecisionTimeoutRef.current)
    }
  }, [])

  // 下载图片
  const downloadImage = useCallback((canvas: HTMLCanvasElement, filename: string) => {
    const link = document.createElement("a")
    link.download = filename
    link.href = canvas.toDataURL()
    link.click()
  }, [])

  // 获取尺寸信息
  const getSizeInfo = useCallback(() => {
    const surfaceSize = surfaceImage.originalCanvas
      ? `${surfaceImage.originalCanvas.width}×${surfaceImage.originalCanvas.height}`
      : "未上传"
    const innerSize = innerImage.originalCanvas
      ? `${innerImage.originalCanvas.width}×${innerImage.originalCanvas.height}`
      : "未上传"
    const outputSize = outputCanvas ? `${outputCanvas.width}×${outputCanvas.height}` : "未生成"

    const needsResize =
      surfaceImage.originalCanvas &&
      innerImage.originalCanvas &&
      (surfaceImage.originalCanvas.width !== innerImage.originalCanvas.width ||
        surfaceImage.originalCanvas.height !== innerImage.originalCanvas.height)

    return { surfaceSize, innerSize, outputSize, needsResize }
  }, [surfaceImage.originalCanvas, innerImage.originalCanvas, outputCanvas])

  const sizeInfo = getSizeInfo()

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="text-center py-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">光棱坦克图片制作器</h1>
          <p className="text-gray-600">通过色阶处理和像素合成技术制作特殊效果图片</p>
        </div>

        <Tabs defaultValue="create" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="create" className="flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              制作光棱坦克
            </TabsTrigger>
            <TabsTrigger value="parse" className="flex items-center gap-2">
              <Search className="w-4 h-4" />
              解析光棱坦克
            </TabsTrigger>
          </TabsList>

          <TabsContent value="create" className="space-y-6">
            {/* 尺寸信息提示 */}
            {(surfaceImage.originalCanvas || innerImage.originalCanvas) && (
              <Card className="bg-blue-50 border-blue-200">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
                    <div className="space-y-2 text-sm">
                      <div className="font-medium text-blue-900">图片尺寸信息</div>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-blue-700">
                        <div>表图: {sizeInfo.surfaceSize}</div>
                        <div>里图: {sizeInfo.innerSize}</div>
                        <div>输出: {sizeInfo.outputSize}</div>
                      </div>
                      {sizeInfo.needsResize && (
                        <div className="text-blue-600 bg-blue-100 p-2 rounded text-xs">
                          ⚠️ 检测到图片尺寸不同，里图将自动缩放到表图尺寸 ({sizeInfo.surfaceSize}) 进行合成
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* 表图和里图编辑区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 表图 */}
              <ImageEditor
                title="表图"
                imageData={surfaceImage}
                settings={tempSurfaceSettings}
                isProcessing={isProcessingSurface}
                onFileUpload={(file) => handleFileUpload(file, true)}
                onSettingsChange={handleSurfaceSettingsChange}
                onReset={() => {
                  const resetSettings = {
                    outputLevelsMin: 25,
                    outputLevelsMax: 255,
                    exposure: 0,
                    brightness: 0,
                    contrast: 0,
                  }
                  setTempSurfaceSettings(resetSettings)
                  setSurfaceSettings(resetSettings)
                  if (surfaceTimeoutRef.current) {
                    clearTimeout(surfaceTimeoutRef.current)
                    setIsProcessingSurface(false)
                  }
                }}
              />

              {/* 里图 */}
              <ImageEditor
                title="里图"
                imageData={innerImage}
                settings={tempInnerSettings}
                isProcessing={isProcessingInner}
                onFileUpload={(file) => handleFileUpload(file, false)}
                onSettingsChange={handleInnerSettingsChange}
                onReset={() => {
                  const resetSettings = {
                    outputLevelsMin: 0,
                    outputLevelsMax: 25,
                    exposure: 0,
                    brightness: 0,
                    contrast: 0,
                  }
                  setTempInnerSettings(resetSettings)
                  setInnerSettings(resetSettings)
                  if (innerTimeoutRef.current) {
                    clearTimeout(innerTimeoutRef.current)
                    setIsProcessingInner(false)
                  }
                }}
              />
            </div>

            {/* 输出结果预览 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 合成结果 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    输出结果预览
                    <div className="flex items-center gap-2">
                      {isProcessingOutput && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      {outputCanvas && (
                        <Button size="sm" onClick={() => downloadImage(outputCanvas, "prism-tank.png")}>
                          <Download className="w-4 h-4 mr-2" />
                          下载
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden relative group">
                    {outputCanvas ? (
                      <>
                        <canvas
                          ref={(ref) => {
                            if (ref && outputCanvas) {
                              const ctx = ref.getContext("2d")
                              if (ctx) {
                                ref.width = outputCanvas.width
                                ref.height = outputCanvas.height
                                ctx.drawImage(outputCanvas, 0, 0)
                              }
                            }
                          }}
                          className="max-w-full max-h-full object-contain cursor-pointer"
                          onClick={() => {
                            setFullscreenImage(outputCanvas)
                            setIsFullscreenOpen(true)
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setFullscreenImage(outputCanvas)
                            setIsFullscreenOpen(true)
                          }}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <p className="text-gray-500">请先上传表图和里图</p>
                    )}
                  </div>

                  {/* 分割精度控制 */}
                  <div className="space-y-2">
                    <Label>分割精度: {tempSplitPrecision}px</Label>
                    <Slider
                      value={[tempSplitPrecision]}
                      onValueChange={([value]) => handleSplitPrecisionChange(value)}
                      min={1}
                      max={20}
                      step={1}
                      className="mt-2"
                    />
                    <p className="text-xs text-gray-500">控制棋盘格的大小，1为像素级精度，数值越大棋盘格越大</p>
                  </div>
                </CardContent>
              </Card>

              {/* 恢复结果预览 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    恢复结果预览（调整参数以预览图像恢复后的样子）
                    <div className="flex items-center gap-2">
                      {isProcessingRecovery && <Loader2 className="w-4 h-4 animate-spin text-blue-500" />}
                      {recoveryCanvas && (
                        <Button size="sm" onClick={() => downloadImage(recoveryCanvas, "recovered.png")}>
                          <Download className="w-4 h-4 mr-2" />
                          下载
                        </Button>
                      )}
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden relative group">
                      {recoveryCanvas ? (
                        <>
                          <canvas
                            ref={(ref) => {
                              if (ref && recoveryCanvas) {
                                const ctx = ref.getContext("2d")
                                if (ctx) {
                                  ref.width = recoveryCanvas.width
                                  ref.height = recoveryCanvas.height
                                  ctx.drawImage(recoveryCanvas, 0, 0)
                                }
                              }
                            }}
                            className="max-w-full max-h-full object-contain cursor-pointer"
                            onClick={() => {
                              setFullscreenImage(recoveryCanvas)
                              setIsFullscreenOpen(true)
                            }}
                          />
                          <Button
                            size="sm"
                            variant="secondary"
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={() => {
                              setFullscreenImage(recoveryCanvas)
                              setIsFullscreenOpen(true)
                            }}
                          >
                            <Maximize2 className="w-4 h-4" />
                          </Button>
                        </>
                      ) : (
                        <p className="text-gray-500">等待合成结果</p>
                      )}
                    </div>

                    {/* 恢复控制 */}
                    <div className="space-y-3">
                      <div>
                        <Label>曝光度: {tempRecoverySettings.exposure}</Label>
                        <Slider
                          value={[tempRecoverySettings.exposure]}
                          onValueChange={([value]) =>
                            handleRecoverySettingsChange({ ...tempRecoverySettings, exposure: value })
                          }
                          min={-2}
                          max={2}
                          step={0.1}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>亮度: {tempRecoverySettings.brightness}</Label>
                        <Slider
                          value={[tempRecoverySettings.brightness]}
                          onValueChange={([value]) =>
                            handleRecoverySettingsChange({ ...tempRecoverySettings, brightness: value })
                          }
                          min={-100}
                          max={100}
                          step={1}
                          className="mt-2"
                        />
                      </div>
                      <div>
                        <Label>对比度: {tempRecoverySettings.contrast}</Label>
                        <Slider
                          value={[tempRecoverySettings.contrast]}
                          onValueChange={([value]) =>
                            handleRecoverySettingsChange({ ...tempRecoverySettings, contrast: value })
                          }
                          min={-100}
                          max={100}
                          step={1}
                          className="mt-2"
                        />
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="parse" className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* 光棱坦克图片上传 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    光棱坦克图片
                    {isProcessingParse && (
                      <div className="flex items-center gap-2 text-sm text-blue-600">
                        <Loader2 className="w-4 h-4 animate-spin" />
                        解析中...
                      </div>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* 文件上传区域 */}
                  <ParseImageUploader imageData={parseImage} onFileUpload={handleParseFileUpload} />

                  {/* 解析设置 */}
                  <div className="space-y-4">
                    <div className="space-y-3">
                      <Label>里图位置</Label>
                      <RadioGroup
                        value={innerPosition}
                        onValueChange={(value: "odd" | "even") => setInnerPosition(value)}
                        className="flex flex-row gap-6"
                      >
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="odd" id="odd" />
                          <Label htmlFor="odd">奇数棋盘</Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <RadioGroupItem value="even" id="even" />
                          <Label htmlFor="even">偶数棋盘</Label>
                        </div>
                      </RadioGroup>
                      <p className="text-xs text-gray-500">
                        选择里图在棋盘格中的位置，影响解析算法的处理方式。算法：四向取均值
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label>解析精度: {tempParsePrecision}px</Label>
                      <Slider
                        value={[tempParsePrecision]}
                        onValueChange={([value]) => handleParsePrecisionChange(value)}
                        min={1}
                        max={20}
                        step={1}
                        className="mt-2"
                      />
                      <p className="text-xs text-gray-500">应与制作时的分割精度保持一致</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* 解析结果 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    解析结果
                    {parsedCanvas && (
                      <Button size="sm" onClick={() => downloadImage(parsedCanvas, "parsed-image.png")}>
                        <Download className="w-4 h-4 mr-2" />
                        下载
                      </Button>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="aspect-square bg-gray-100 rounded-lg flex items-center justify-center overflow-hidden relative group">
                    {parsedCanvas ? (
                      <>
                        <canvas
                          ref={(ref) => {
                            if (ref && parsedCanvas) {
                              const ctx = ref.getContext("2d")
                              if (ctx) {
                                ref.width = parsedCanvas.width
                                ref.height = parsedCanvas.height
                                ctx.drawImage(parsedCanvas, 0, 0)
                              }
                            }
                          }}
                          className="max-w-full max-h-full object-contain cursor-pointer"
                          onClick={() => {
                            setFullscreenImage(parsedCanvas)
                            setIsFullscreenOpen(true)
                          }}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => {
                            setFullscreenImage(parsedCanvas)
                            setIsFullscreenOpen(true)
                          }}
                        >
                          <Maximize2 className="w-4 h-4" />
                        </Button>
                      </>
                    ) : (
                      <p className="text-gray-500">请先上传光棱坦克图片</p>
                    )}
                  </div>

                  {/* 直方图 */}
                  {parseImage.histogram.some((v) => v > 0) && (
                    <div className="space-y-2">
                      <Label>色阶分布</Label>
                      <div className="h-20 bg-gray-100 rounded flex items-end justify-center p-2">
                        <svg width="256" height="60" className="w-full">
                          {parseImage.histogram.map((value, index) => {
                            const maxValue = Math.max(...parseImage.histogram)
                            const height = (value / maxValue) * 50
                            return (
                              <rect key={index} x={index} y={50 - height} width="1" height={height} fill="#6366f1" />
                            )
                          })}
                        </svg>
                      </div>
                    </div>
                  )}

                  {/* 图像调整控制 */}
                  <div className="space-y-3">
                    <div>
                      <Label>曝光度: {tempParseSettings.exposure}</Label>
                      <Slider
                        value={[tempParseSettings.exposure]}
                        onValueChange={([value]) =>
                          handleParseSettingsChange({ ...tempParseSettings, exposure: value })
                        }
                        min={-2}
                        max={2}
                        step={0.1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>亮度: {tempParseSettings.brightness}</Label>
                      <Slider
                        value={[tempParseSettings.brightness]}
                        onValueChange={([value]) =>
                          handleParseSettingsChange({ ...tempParseSettings, brightness: value })
                        }
                        min={-100}
                        max={100}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                    <div>
                      <Label>对比度: {tempParseSettings.contrast}</Label>
                      <Slider
                        value={[tempParseSettings.contrast]}
                        onValueChange={([value]) =>
                          handleParseSettingsChange({ ...tempParseSettings, contrast: value })
                        }
                        min={-100}
                        max={100}
                        step={1}
                        className="mt-2"
                      />
                    </div>
                  </div>

                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const resetSettings = {
                        exposure: 2,
                        brightness: 80,
                        contrast: 100,
                      }
                      setTempParseSettings(resetSettings)
                      setParseSettings(resetSettings)
                      if (parseTimeoutRef.current) {
                        clearTimeout(parseTimeoutRef.current)
                        setIsProcessingParse(false)
                      }
                    }}
                    className="w-full"
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    重置设置
                  </Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        <FullscreenImageViewer
          canvas={fullscreenImage}
          isOpen={isFullscreenOpen}
          onClose={() => {
            setIsFullscreenOpen(false)
            setFullscreenImage(null)
          }}
        />
      </div>
    </div>
  )
}

// 图像编辑器组件
function ImageEditor({
  title,
  imageData,
  settings,
  isProcessing,
  onFileUpload,
  onSettingsChange,
  onReset,
}: {
  title: string
  imageData: ImageData
  settings: ImageSettings
  isProcessing: boolean
  onFileUpload: (file: File) => void
  onSettingsChange: (settings: ImageSettings) => void
  onReset: () => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) => file.type.startsWith("image/"))
      if (imageFile) {
        onFileUpload(imageFile)
      }
    },
    [onFileUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onFileUpload(file)
      }
    },
    [onFileUpload],
  )

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          {title}
          {isProcessing && (
            <div className="flex items-center gap-2 text-sm text-blue-600">
              <Loader2 className="w-4 h-4 animate-spin" />
              处理中...
            </div>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 文件上传区域 */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
          onDrop={handleDrop}
          onDragOver={(e) => e.preventDefault()}
          onClick={() => fileInputRef.current?.click()}
        >
          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
          {imageData.canvas ? (
            <div className="space-y-2">
              <canvas
                ref={(ref) => {
                  if (ref && imageData.canvas) {
                    const ctx = ref.getContext("2d")
                    if (ctx) {
                      ref.width = imageData.canvas.width
                      ref.height = imageData.canvas.height
                      ctx.drawImage(imageData.canvas, 0, 0)
                    }
                  }
                }}
                className="max-w-full max-h-48 object-contain mx-auto"
              />
              <p className="text-sm text-gray-500">点击或拖拽更换图片</p>
            </div>
          ) : (
            <div className="space-y-2">
              <Upload className="w-12 h-12 text-gray-400 mx-auto" />
              <p className="text-gray-500">点击或拖拽上传图片</p>
            </div>
          )}
        </div>

        {/* 直方图 */}
        {imageData.histogram.some((v) => v > 0) && (
          <div className="space-y-2">
            <Label>色阶分布</Label>
            <div className="h-20 bg-gray-100 rounded flex items-end justify-center p-2">
              <svg width="256" height="60" className="w-full">
                {imageData.histogram.map((value, index) => {
                  const maxValue = Math.max(...imageData.histogram)
                  const height = (value / maxValue) * 50
                  return <rect key={index} x={index} y={50 - height} width="1" height={height} fill="#6366f1" />
                })}
              </svg>
            </div>
          </div>
        )}

        {/* 编辑控制 */}
        <div className="space-y-4">
          <div className="space-y-3">
            <Label>输出色阶</Label>
            <div className="space-y-2">
              <div>
                <Label className="text-sm text-gray-600">最小值: {settings.outputLevelsMin}</Label>
                <Slider
                  value={[settings.outputLevelsMin]}
                  onValueChange={([value]) =>
                    onSettingsChange({
                      ...settings,
                      outputLevelsMin: Math.min(value, settings.outputLevelsMax - 1),
                    })
                  }
                  min={0}
                  max={254}
                  step={1}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-sm text-gray-600">最大值: {settings.outputLevelsMax}</Label>
                <Slider
                  value={[settings.outputLevelsMax]}
                  onValueChange={([value]) =>
                    onSettingsChange({
                      ...settings,
                      outputLevelsMax: Math.max(value, settings.outputLevelsMin + 1),
                    })
                  }
                  min={1}
                  max={255}
                  step={1}
                  className="mt-1"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>曝光度: {settings.exposure}</Label>
            <Slider
              value={[settings.exposure]}
              onValueChange={([value]) => onSettingsChange({ ...settings, exposure: value })}
              min={-2}
              max={2}
              step={0.1}
              className="mt-2"
            />
          </div>

          <div>
            <Label>亮度: {settings.brightness}</Label>
            <Slider
              value={[settings.brightness]}
              onValueChange={([value]) => onSettingsChange({ ...settings, brightness: value })}
              min={-100}
              max={100}
              step={1}
              className="mt-2"
            />
          </div>

          <div>
            <Label>对比度: {settings.contrast}</Label>
            <Slider
              value={[settings.contrast]}
              onValueChange={([value]) => onSettingsChange({ ...settings, contrast: value })}
              min={-100}
              max={100}
              step={1}
              className="mt-2"
            />
          </div>

          <Button variant="outline" size="sm" onClick={onReset} className="w-full bg-transparent">
            <RotateCcw className="w-4 h-4 mr-2" />
            重置设置
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// 解析图片上传组件
function ParseImageUploader({
  imageData,
  onFileUpload,
}: {
  imageData: ImageData
  onFileUpload: (file: File) => void
}) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      const imageFile = files.find((file) => file.type.startsWith("image/"))
      if (imageFile) {
        onFileUpload(imageFile)
      }
    },
    [onFileUpload],
  )

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        onFileUpload(file)
      }
    },
    [onFileUpload],
  )

  return (
    <div
      className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-gray-400 transition-colors"
      onDrop={handleDrop}
      onDragOver={(e) => e.preventDefault()}
      onClick={() => fileInputRef.current?.click()}
    >
      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} className="hidden" />
      {imageData.originalCanvas ? (
        <div className="space-y-2">
          <canvas
            ref={(ref) => {
              if (ref && imageData.originalCanvas) {
                const ctx = ref.getContext("2d")
                if (ctx) {
                  ref.width = imageData.originalCanvas.width
                  ref.height = imageData.originalCanvas.height
                  ctx.drawImage(imageData.originalCanvas, 0, 0)
                }
              }
            }}
            className="max-w-full max-h-48 object-contain mx-auto"
          />
          <p className="text-sm text-gray-500">点击或拖拽更换图片</p>
        </div>
      ) : (
        <div className="space-y-2">
          <Upload className="w-12 h-12 text-gray-400 mx-auto" />
          <p className="text-gray-500">点击或拖拽上传光棱坦克图片</p>
        </div>
      )}
    </div>
  )
}
