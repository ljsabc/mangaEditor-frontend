import Bowser from 'bowser'
import $ from 'jquery'
import 'jquery-ui'
import 'blueimp-file-upload'
import 'bootstrap3'
import WebFont from 'webfontloader'
import 'fabric'
import Analytics from 'analytics'
import googleAnalyticsPlugin from 'analytics-plugin-ga'

var SCALE_FACTOR = 1.2
var canvasScale = 1

var fileDetails = {}
var originalImage
var canvasBackground

function getCookie (name) {
  var value = '; ' + document.cookie
  var parts = value.split('; ' + name + '=')
  if (parts.length === 2) return parts.pop().split(';').shift()
}

function SBC2DBC (str) {
  var result = ''
  for (let i = 0; i < str.length; i++) {
    let code = str.charCodeAt(i)
    if (code >= 33 && code <= 125) {
      result += String.fromCharCode(str.charCodeAt(i) + 65248)
    } else if (code === 32) {
      result += String.fromCharCode(str.charCodeAt(i) + 12288 - 32)
    } else {
      result += str.charAt(i)
    }
  }
  return result
}

$.fn.getPreText = function () {
  var ce = $('<pre />').html(this.html())
  if (Bowser.webkit || Bowser.blink) {
    ce.find('div').replaceWith(function () {
      return '\n' + this.innerHTML
    })
  }
  if (Bowser.msie) {
    ce.find('p').replaceWith(function () {
      return this.innerHTML + '<br>'
    })
  }
  if (Bowser.mozilla || Bowser.opera || Bowser.msie) {
    ce.find('br').replaceWith('\n')
  }
  if (ce.text() === '') {
    return '\u3000'
  } else {
    return ce.text()
  }
}

// TODO: generate a grid-system, storing all coordinates inside an array.
// var canvas = new fabric.Canvas('generatedMedia');
var fontSizeCache = []

function measureTextHeight (text, fontSize, fontFamily) {
  // create a temp canvas
  var width = fontSize * 1.5
  var height = fontSize * 1.5
  var cvs = document.createElement('canvas')
  cvs.width = width
  cvs.height = height
  var ctx = cvs.getContext('2d')

  let fontSizeFace = fontSize + 'px ' + fontFamily
  var charWidth
  var charHeight
  var charTop
  var charLeft

  // Draw the entire a-z/A-Z alphabet in the canvas
  ctx.font = fontSizeFace
  ctx.clearRect(0, 0, width, height)
  ctx.fillText(text, 1, fontSize)
  // ctx.restore();

  // Get the pixel data from the canvas
  var data = ctx.getImageData(0, 0, width, height).data
  var first = false
  var last = false

  // Find the last line with a non-transparent pixel
  for (let x = 0; x < height; x++) {
    var stopFlag = false
    for (let y = 0; y < width; y++) {
      let w = data[(x * width + y) * 4 + 3]
      if (w) {
        first = x
        stopFlag = true
        break
      }
    }
    if (stopFlag) {
      break
    }
  }
  if (first) {
    stopFlag = false
    for (let x = height - 1; x >= 0; x--) {
      for (let y = 0; y < width; y++) {
        let w = data[(x * width + y) * 4 + 3]
        if (w) {
          last = x
          stopFlag = true
          break
        }
      }
      if (stopFlag) {
        break
      }
    }
    charHeight = last - first
  } else {
    charHeight = fontSize
  }
  charTop = first

  first = false
  last = false
  for (let y = 0; y < width; y++) {
    stopFlag = false
    for (let x = 0; x < height; x++) {
      let w = data[(x * width + y) * 4 + 3]
      if (w) {
        first = y
        stopFlag = true
        break
      }
    }
    if (stopFlag) {
      break
    }
  }
  if (first) {
    for (let y = width - 1; y >= 0; y--) {
      stopFlag = false
      for (let x = 0; x < height; x++) {
        let w = data[(x * width + y) * 4 + 3]
        if (w) {
          last = y
          stopFlag = true
          break
        }
      }
      if (stopFlag) {
        break
      }
    }
    charWidth = last - first
  } else {
    charWidth = fontSize
  }
  charLeft = first
  var result = []
  result.width = charWidth
  result.height = charHeight
  result.left = charLeft
  result.top = charTop
  // alert(0);
  return result
}

function getRealCharDimension (t, fontSize, fontFamily, f) {
  var tDim
  if (typeof fontSizeCache[t] === 'undefined' || f === true) {
    // does not exist
    tDim = measureTextHeight(t, fontSize, fontFamily)
    fontSizeCache[t] = tDim
  } else {
    // does exist
    tDim = fontSizeCache[t]
  }
  return tDim
}

var balloonLUTSize
var balloonMasks
var additionalTextareaMask

var globalCanvas

var activeBalloon
var activeRect

var editMode
var perTextAreaVerticalMode

var globalFont = ''
var globalFontSize = 20

function getObjectFromId (canvas, balloonId, rectId) {
  const objects = canvas.getObjects()
  // console.log("query:", objects)
  const len = objects.length
  let output = null

  for (let i = 0; i < len; i++) {
    if (objects[i].balloonId !== undefined && objects[i].balloonId === balloonId) {
      if (objects[i].rectId !== undefined && objects[i].rectId === rectId) {
        output = objects[i]
        break
      }
    }
  }
  // console.log(output)
  return output
}

function generateGridSystem (canvas, text, initialGroup, fontSize, fontFamily, fontWeight, type, textareaId, rectId) {
  const width = initialGroup.get('width') * initialGroup.get('scaleX')
  const height = initialGroup.get('height') * initialGroup.get('scaleY')
  const top = initialGroup.get('top')
  const left = initialGroup.get('left')

  console.log(type, top, left, width, height, initialGroup.scaleX, initialGroup.scaleY, fontFamily, fontSize)

  if (type === true) {
    var rows = Math.floor((height + 1) / fontSize)
    var cursorPos = 0
    var grid = []
    // temporarily solve the half-size character problem.
    text = SBC2DBC(text)

    // instantly compute the cols.
    var cols = 0
    for (var i = 0; i < text.length; i++) {
      let dim = {}
      let t = text[i]
      if (t !== '\n') {
        if (i === text.length - 1) {
          dim.x = cursorPos
          dim.y = cols
        } else { // check next char.
          if (cursorPos % rows === rows - 1) {
            if ((text[i + 1].charCodeAt(0) > 65280 && text[i + 1].charCodeAt(0) < 65324) || (text[i + 1].charCodeAt(0) > 12288 && text[i + 1].charCodeAt(0) < 12291)) {
              // force line break on symbols;
              cols += 1
              cursorPos = 0
              dim.x = cursorPos
              dim.y = cols
              cursorPos += 1
            } else {
              if (text[i + 1] !== '\n') {
                dim.x = cursorPos
                dim.y = cols
                cols += 1
                cursorPos = 0
              } else {
                dim.x = cursorPos
                dim.y = cols
                cursorPos += 1
              }
            }
          } else {
            // common state
            dim.x = cursorPos
            dim.y = cols
            cursorPos += 1
          }
        }
      } else {
        cols += 1
        cursorPos = 0
        dim.x = cursorPos
        dim.y = cols
      }
      grid.push(dim)
    }

    var colWidth = fontSize * 1.20

    var texts = []
    for (i = 0; i < text.length; i++) {
      var cursorCol = cols - grid[i].y - 1
      cursorPos = grid[i].x

      let t = text[i]
      // escape can be dealt later.
      // compute stroke position and width;

      var tDim = getRealCharDimension(t, fontSize + fontSize % 2, fontFamily)

      var charWidth = tDim.width
      var charHeight = tDim.height
      var charLeft = tDim.left
      var charTop = tDim.top
      var charAngle = 0
      var leftMargin = width - cols * colWidth + (colWidth - fontSize)

      // render special chars
      var specialChar = false
      var verticalMargin = 0
      switch (t) {
        case '\n': {
          continue
        }
        case '\u3001':
        case '\u3002':
        case '\uff0c': {
          // [ 、]
          specialChar = true
          verticalMargin = -charTop + (fontSize - charHeight) / 2 + 2
          break
        }
        case '\uff01': {
          // [ ！]
          specialChar = true
          break
        }
        case '\u2026':
        case '\u201c':
        case '\u201d': {
          // [ … ]
          t = '\ufe19'
          // tDim = getRealCharDimension(t, fontSize, fontFamily)
          break
        }
        case '\u2014':
        case '\uff5e':
        case '\u007e':
        case '\uff08':
        case '\uff09':
        case '\uff5b':
        case '\uff5d':
        case '\u3010':
        case '\u3011':
        case '\u300a':
        case '\u300b': {
          charAngle = 90
          break
        }
      }
      var topOffset = (cursorPos - 1) * fontSize + verticalMargin
      var leftOffset
      var newText
      if (specialChar) {
        leftOffset = leftMargin + (cursorCol) * colWidth + (fontSize - charWidth) / 2 - charLeft + 3
      } else {
        leftOffset = leftMargin + (cursorCol) * colWidth
      }

      newText = new fabric.Text(t, {
        left: leftOffset,
        top: topOffset,
        fontFamily: fontFamily,
        fontSize: fontSize,
        fontWeight: fontWeight,
        angle: charAngle,
        originX: 'left',
        originY: 'top',
        scaleX: 1,
        scaleY: 1,
        lockScalingX: true,
        lockScalingY: true
      })
      texts.push(newText)
    }

    for (let j = 0; j < 7; j++) {
      let newText = new fabric.Text('\u3000', {
        left: 0,
        top: fontSize,
        fontFamily: fontFamily,
        fontSize: fontSize,
        angle: charAngle,
        originX: 'left',
        originY: 'top',
        scaleX: 1,
        scaleY: 1,
        lockScalingX: true,
        lockScalingY: true
      })
      texts.push(newText)
    }

    let toBeDeletedTexts = []
    initialGroup.forEachObject((obj) => {
      toBeDeletedTexts.push(obj)
    })

    for (let text of texts) {
      // text.on('scaling', x => x.set({ scaleX: 1, scaleY: 1 }))
      initialGroup.add(text)
    }

    for (let text of toBeDeletedTexts) {
      initialGroup.remove(text)
      canvas.remove(text)
    }

    initialGroup.addWithUpdate()

    initialGroup.set({
      left: left,
      top: top,
      width: width,
      height: height,
      hasControls: true,
      hasBorders: true,
      selectable: true,
      scaleX: 1,
      scaleY: 1
    })
    canvas.bringToFront(initialGroup)
  } else {
    let groups = new fabric.Textbox(text, {
      left: left,
      top: top,
      width: width,
      height: height,
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight,
      balloonId: textareaId,
      rectId: rectId,
      hasControls: false,
      hasBorders: true,
      selectable: true,
      editable: false,
      scaleX: 1,
      scaleY: 1
    })
    canvas.add(groups)
  }
}

function enableCanvasObjectInteraction (canvas, textareaId, rectId) {
  const target = getObjectFromId(canvas, textareaId, rectId)

  if (rectId === -1) {
    // we are working on a a mask
    if (!target.hasOwnProperty('selectBinded')) {
      target.on('selected', function () {
        activeBalloon = textareaId
        activeRect = rectId
        $('.canvasQuickEditor').css('display', 'none')
        $('#canvasQuickEditor-Delete').addClass('disabled')
        $('#canvasQuickEditor-Rotate').addClass('disabled')
        $('#originalText').val('')
        $('#translatedText').val('')
        $('img.listItemImage').attr('src', fileDetails[textareaId].originalURL)
        $('#testTranslation').removeClass('disabled')
      })
      target.selectBinded = true
    }
    if (!target.hasOwnProperty('dblClickBinded')) {
      target.on('mousedblclick', function () {
        const i = textareaId
        const j = balloonLUTSize[i]
        if (balloonLUTSize[i] < fileDetails[i].textRectCount) {
          activeBalloon = i
          activeRect = j

          editMode = true
          target.set({ opacity: 1 })

          $('#canvasQuickEditor-Delete').removeClass('disabled')
          $('#canvasQuickEditor-Rotate').removeClass('disabled')
          $('.canvasQuickEditor').css('display', 'inline-block')

          $('#canvasQuickEditor').show()

          $('img.listItemImage').attr('src', fileDetails[textareaId].originalURL)
          $('#testTranslation').removeClass('disabled')
          $('#originalText').val('')
          $('#translatedText').val('')

          const data = target.data
          const computedScale = target.computedScale

          const top = data.textRect[j].y * computedScale
          const left = data.textRect[j].x * computedScale
          const width = data.textRect[j].width * computedScale
          const height = data.textRect[j].height * computedScale
          const divTemplate = `<div class='tb-rl writingArea balloon${i} rect${j}' contenteditable='plaintext-only'></div>`
          $('div.canvas-container').append(divTemplate)

          var font = $('#canvasQuickEditor select option:selected').val()
          $(`.balloon${i}.rect${j}`).css({
            'top': top + 'px',
            'left': left + 'px',
            'width': width + 'px',
            'height': height + 'px',
            'font-family': font,
            'box-shadow': '0px 0px 2px 1px #66ccff',
            'font-size': globalFontSize
          })

          if (globalFont !== '') {
            $(`.balloon${i}.rect${j}`).css({
              'font-family': globalFont
            })
          }

          $(`.balloon${i}.rect${j}`).focus()
          perTextAreaVerticalMode[i][j] = true

          $(document).on('click', function (evt) {
            var $tgt = $(evt.target)
            if (!$tgt.is('li,select,option,button,i') && !$tgt.is(`.balloon${i}.rect${j}`) && !$tgt.is('.writingArea div')) {
              editMode = false
              renderContent(canvas, i, j, false)
              canvas.trigger('object:selected', { target: target })
              $(document).off('click')
            }
          })

          balloonLUTSize[i] += 1
          if (balloonLUTSize[i] === fileDetails[i].textRectCount) {
            target.set({
              selectable: false,
              hoverCursor: 'default'
            })
          }
        } else {
        // no more can be added

        }
      })
      target.dblClickBinded = true
    }
  } else {
    if (!target.hasOwnProperty('rescaleBinded')) {
      target.on('scaling', function () {
        onObjectScaled(canvas, target)
      })
      target.rescaleBinded = true
    }
    if (target.additonalRect && !target.hasOwnProperty('movingBinded')) {
      target.on('moving', function () {
        const j = rectId
        additionalTextareaMask[j].set({
          left: target.get('left'),
          top: target.get('top'),
          width: target.get('width'),
          height: target.get('height'),
          scaleX: 1,
          scaleY: 1
        })
      })
      target.movingBinded = true
    }
    if (!target.hasOwnProperty('selectBinded')) {
      target.on('selected', function () {
        activeBalloon = textareaId
        activeRect = rectId
        $('#canvasQuickEditor-Delete').removeClass('disabled')
        $('#canvasQuickEditor-Rotate').removeClass('disabled')
        $('.canvasQuickEditor').css('display', 'inline-block')
        $('#canvasQuickEditor').show()
        $('#testTranslation').removeClass('disabled')
        $('#originalText').val('')
        $('#translatedText').val('')
        if (textareaId < fileDetails.balloonCount) {
          $('img.listItemImage').attr('src', fileDetails[textareaId].originalURL)
        }
      })
      target.set({ selectBinded: true })
    }

    if (!target.hasOwnProperty('movingBinded')) {
      target.on('moving', function () {
        const top = target.get('top')
        const left = target.get('left')

        $('.balloon' + textareaId + '.rect' + rectId).css({
          'top': top + 'px',
          'left': left + 'px'
        })
      })
      target.set({ movingBinded: true })
    }
    if (!target.hasOwnProperty('dblselectBinded')) {
      target.on('mousedblclick', function () {
        editMode = true

        $('#canvasQuickEditor-Delete').removeClass('disabled')
        $('#canvasQuickEditor-Rotate').removeClass('disabled')
        $('.canvasQuickEditor').css('display', 'inline-block')

        const i = textareaId
        const j = rectId

        activeBalloon = i
        activeRect = j

        if (i < fileDetails.balloonCount) {
          $('img.listItemImage').attr('src', fileDetails[i].originalURL)
          $('#testTranslation').removeClass('disabled')
          $('#originalText').val('')
          $('#translatedText').val('')
        } else {
          $('#testTranslation').addClass('disabled')
        }

        let top = target.get('top')
        let left = target.get('left')
        let width = target.get('width')
        let height = target.get('height')

        $(`.balloon${i}.rect${j}`).css({
          'top': top + 'px',
          'left': left + 'px',
          'width': width + 'px',
          'height': height + 'px',
          'opacity': 1,
          'box-shadow': '0px 0px 2px 1px #66ccff'
        })

        $(`.balloon${i}.rect${j}`).show()
        $(`.balloon${i}.rect${j}`).focus()
        $(document).on('click', function (evt) {
          var $tgt = $(evt.target)
          if (!$tgt.is('li,select,option,button,i') && !$tgt.is(`.balloon${i}.rect${j}`) && !$tgt.is('.writingArea div')) {
            editMode = false
            renderContent(canvas, i, j, target.additionalRect)
            canvas.bringToFront(target)
            target.set({ hoverCursor: 'pointer' })
            canvas.trigger('object:selected', { target: target })
            canvas.renderAll()
            $(document).off('click')
          }
        })
        target.set({ dblselectBinded: true })
      })
    }
  }
}

function onObjectScaled (canvas, target) {
  const textareaId = target.balloonId
  const rectId = target.rectId

  let i = textareaId
  let j = rectId

  activeBalloon = i
  activeRect = j

  console.log(perTextAreaVerticalMode[i][j])

  if (perTextAreaVerticalMode[i][j]) {
    $('#originalText').val('')
    $('#translatedText').val('')

    renderContent(canvas, textareaId, rectId, target.additionalRect)
    if (target.additonalRect) {
      additionalTextareaMask[j].set({
        left: target.get('left'),
        top: target.get('top'),
        width: target.get('width'),
        height: target.get('height'),
        scaleX: 1,
        scaleY: 1
      })
    }
  } else {
    // if horizontal mode
    // should be somehow quite simple.
    // TODO
  }
  canvas.renderAll()
}

function renderContent (canvas, textareaId, rectId, additional) {
  // clear existing instance
  const textarea = $(`.balloon${textareaId}.rect${rectId}`)
  const width = parseFloat(textarea.css('width'))
  const height = parseFloat(textarea.css('height'))
  const left = parseFloat(textarea.css('left'))
  const top = parseFloat(textarea.css('top'))
  // console.log("render:", left, top, width, height)

  var fontSize = parseFloat(textarea.css('font-size'))

  let group
  const target = getObjectFromId(canvas, textareaId, rectId)
  if (target && target.get('type') === 'group') {
    group = getObjectFromId(canvas, textareaId, rectId)
  } else {
    if (target) {
      canvas.remove(target)
    }
    group = new fabric.Group([], {
      left: left,
      top: top,
      width: width,
      height: height,
      hasControls: true,
      selectable: true,
      originX: 'left',
      originY: 'top',
      balloonId: textareaId,
      rectId: rectId,
      additonalRect: additional
    })
    console.log(group.additionalRect, additional)
    canvas.add(group)
  }

  const i = textareaId
  const j = rectId

  const text = textarea.getPreText()
  generateGridSystem(canvas, text, group, fontSize, textarea.css('font-family'), textarea.css('font-weight'), perTextAreaVerticalMode[i][j], textareaId, rectId)
  getObjectFromId(canvas, textareaId, rectId).additionalRect = additional
  enableCanvasObjectInteraction(canvas, textareaId, rectId)

  $(textarea).hide()
  group.set({
    selectable: true,
    hoverCursor: 'pointer'
  })

  // looks like they are dummy. But we have to.
  activeBalloon = textareaId
  activeRect = rectId
  canvas.trigger('object:selected', { target: group })
  canvas.renderAll()
}

function zoomTo (canvas, scale) {
  // TODO limit max cavas zoom out

  SCALE_FACTOR = scale / canvasScale
  canvasScale = scale

  canvas.setHeight(canvas.get('height') * (1 / SCALE_FACTOR))
  canvas.setWidth(canvas.get('width') * (1 / SCALE_FACTOR))

  var objects = canvas.getObjects()
  // console.log(objects);
  for (var i in objects) {
    var scaleX = objects[i].scaleX
    var scaleY = objects[i].scaleY
    var left = objects[i].left
    var top = objects[i].top

    var tempScaleX = scaleX * (1 / SCALE_FACTOR)
    var tempScaleY = scaleY * (1 / SCALE_FACTOR)
    var tempLeft = left * (1 / SCALE_FACTOR)
    var tempTop = top * (1 / SCALE_FACTOR)

    objects[i].scaleX = tempScaleX
    objects[i].scaleY = tempScaleY
    objects[i].left = tempLeft
    objects[i].top = tempTop

    objects[i].setCoords()

    if (objects[i].balloonId && objects[i].rectId) {
      const textarea = $(`.balloon${objects[i].balloonId}.rect${objects[i].rectId}`)
      const width = parseFloat(textarea.css('width'))
      const height = parseFloat(textarea.css('height'))
      const left = parseFloat(textarea.css('left'))
      const top = parseFloat(textarea.css('top'))
      $(`.balloon${objects[i].balloonId}.rect${objects[i].rectId}`).css({
        'top': width + 'px',
        'left': height + 'px',
        'width': left + 'px',
        'height': top + 'px'
      })
    }
  }

  canvas.renderAll()
  SCALE_FACTOR = 1.2
}

function addBalloonMasks (canvas, data, computedScale) {
  let loadCount = 0
  for (let i = 0; i < data.balloonCount; i++) {
    fabric.Image.fromURL(data[i].filledMaskURL, oImg => {
      // scale image down, and flip it, before adding it onto canvas
      // oImg.scale(0.5).setFlipX(true);

      loadCount += 1
      oImg.set({
        opacity: 0.0,
        selectable: true,
        lockMovementX: true,
        lockMovementY: true,
        hasControls: false,
        hasBorders: false,
        hoverCursor: 'pointer',
        data: data[i],
        computedScale: computedScale,
        balloonId: i,
        rectId: -1
      })

      oImg.scaleToWidth(fileDetails[i].boundingRect.width * computedScale)
      oImg.scaleToHeight(fileDetails[i].boundingRect.height * computedScale)

      balloonMasks.push(oImg)
      canvas.add(oImg)
      enableCanvasObjectInteraction(canvas, i, -1)
      canvas.bringToFront(oImg)

      if (loadCount === data.balloonCount) {
        // when all are loaded
        $('div.actions ul').click(function () {
          $(this).parent().css('opacity', '0')
        })
        setTimeout(() => {
          if (typeof (Event) === 'function') {
            // modern browsers
            window.dispatchEvent(new Event('resize'))
          } else {
            // for IE and other old browsers
            // causes deprecation warning on modern browsers
            var evt = window.document.createEvent('UIEvents')
            evt.initUIEvent('resize', true, false, window, 0)
            window.dispatchEvent(evt)
          }
          canvas.renderAll()
        }, 400)
      }
    }, {
      'left': data[i].boundingRect.x * computedScale,
      'top': data[i].boundingRect.y * computedScale,
      originX: 'left',
      OriginY: 'top',
      opacity: 0.00,
      selectable: true,
      hasControls: false,
      lockMovementX: true,
      lockMovementY: true,
      hasBorders: false,
      hoverCursor: 'pointer'
    })
  }
}

function initializeBalloonChecker (canvas, width, height, originalImage, data) {
  // preload balloon images
  var preload = []
  for (var i = 0; i < fileDetails.balloonCount; i++) {
    preload[i] = new Image()
    preload[i].src = data[i].originalURL
  }

  // Initialize helpers
  function dataURLtoBlob (dataurl) {
    var arr = dataurl.split(',')
    var mime = arr[0].match(/:(.*?);/)[1]
    var bstr = atob(arr[1])
    var n = bstr.length
    var u8arr = new Uint8Array(n)
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n)
    }
    return new Blob([u8arr], {
      type: mime
    })
  }

  $('#balloonChecker').hide()
  // trigger save button

  $('.darkroom-icon-save').parent().click(function (ev) {
    ev.preventDefault()
    // open result in new windows.
    var originalScale = canvasScale
    zoomTo(canvas, 1)
    canvas.discardActiveObject()

    canvas.renderAll()

    let d = document.getElementById('balloonChecker').toDataURL(data.type)

    var blob = dataURLtoBlob(d)
    var objurl = URL.createObjectURL(blob)

    $('#saveImg')[0].href = objurl
    $('#saveImg')[0].download = 'e-' + data.fileName.substring(data.fileName.lastIndexOf('/') + 1)
    $('#saveImg')[0].click()

    zoomTo(canvas, originalScale)
  })

  canvas.on('selection:cleared', function () {
    if (!editMode) {
      $('#canvasQuickEditor-Delete').addClass('disabled')
      $('#canvasQuickEditor-Rotate').addClass('disabled')
      $('.canvasQuickEditor').css('display', 'none')
    }
  })

  // trigger add routine
  $('.darkroom-icon-add').parent().click(function (ev) {
    ev.preventDefault()

    // add a mouse down trigger.
    var rect, isDown, origX, origY

    canvas.on('mouse:down', addRectMouseDown)
    canvas.on('mouse:move', addRectMouseMove)
    canvas.on('mouse:up', addRectMouseUp)

    function addRectMouseDown (o) {
      isDown = true
      let pointer = canvas.getPointer(o.e)
      origX = pointer.x
      origY = pointer.y
      pointer = canvas.getPointer(o.e)
      rect = new fabric.Rect({
        left: origX,
        top: origY,
        originX: 'left',
        originY: 'top',
        width: pointer.x - origX,
        height: pointer.y - origY,
        angle: 0,
        fill: 'rgba(255,0,0,0.5)',
        transparentCorners: false
      })
      canvas.add(rect)
      canvas.renderAll()
    }

    function addRectMouseMove (o) {
      if (!isDown) return
      var pointer = canvas.getPointer(o.e)

      if (origX > pointer.x) {
        rect.set({
          left: Math.abs(pointer.x)
        })
      }
      if (origY > pointer.y) {
        rect.set({
          top: Math.abs(pointer.y)
        })
      }

      rect.set({
        width: Math.abs(origX - pointer.x)
      })
      rect.set({
        height: Math.abs(origY - pointer.y)
      })

      canvas.renderAll()
    }

    function addRectMouseUp (o) {
      if (isDown) {
        isDown = false
        canvas.off('mouse:down', addRectMouseDown)
        canvas.off('mouse:move', addRectMouseMove)
        canvas.off('mouse:up', addRectMouseUp)

        var i = data.balloonCount
        var j = balloonLUTSize[i]
        editMode = true

        // currently 10 more manual rect supported.
        // this can be set manually.
        // However, 10 is enough. I think.

        activeBalloon = i
        activeRect = j

        $('#originalText').val('')
        $('#translatedText').val('')

        var pointer = canvas.getPointer(o.e)

        const width = Math.abs(origX - pointer.x)
        const height = Math.abs(origY - pointer.y)
        const divTemplate = `<div class='tb-rl writingArea balloon${i} rect${j}' contenteditable='plaintext-only'></div>`
        $('div.canvas-container').append(divTemplate)

        var newRect2 = new fabric.Rect({
          left: rect.left,
          top: rect.top,
          fill: 'rgba(255,255,255,1.0)',
          width: width,
          height: height,
          scaleX: 1,
          scaleY: 1,
          selectable: false,
          hasControls: false
        })
        canvas.add(newRect2)
        additionalTextareaMask[j] = newRect2
        canvas.remove(rect)

        $(`.balloon${i}.rect${j}`).css({
          'top': newRect2.top + 'px',
          'left': newRect2.left + 'px',
          'width': newRect2.width + 'px',
          'height': newRect2.height + 'px',
          'min-height': newRect2.height + 'px',
          'box-shadow': '0px 0px 2px 1px #66ccff'
        })

        // now adding canvas texts
        balloonLUTSize[i] += 1
        perTextAreaVerticalMode[i][j] = true
        renderContent(canvas, i, j, true)
        // const target = getObjectFromId(canvas, i, j)
        canvas.renderAll()
        setTimeout(() => {
          canvas.trigger('mouse:dblclick', { target: getObjectFromId(canvas, i, j) })
        }, 50)
      }
    }
  })

  // append quick editor

  $('.darkroom-toolbar button').click(function (ev) {
    ev.preventDefault()
  })
  $('#canvasQuickEditor-Font select').change(function () {
    var i = activeBalloon
    var j = activeRect
    var font = $('#canvasQuickEditor-Font select option:selected').val()
    globalFont = font
    $(`.balloon${i}.rect${j}`).css('font-family', font)
    if (!editMode) {
      renderContent(canvas, i, j, false)
    }
  })

  var timeoutId = 0

  $('#canvasQuickEditor-Enlarge').mousedown(function (ev) {
    ev.preventDefault()
    // clear font size cache
    fontSizeCache = []

    var i = activeBalloon
    var j = activeRect

    var fontSize = parseInt($(`.balloon${i}.rect${j}`).css('font-size'), 10) + 1
    globalFontSize = fontSize

    $(`.balloon${i}.rect${j}`).css('font-size', fontSize + 'px')
    if (!editMode) {
      renderContent(canvas, i, j, false)
    }

    timeoutId = setInterval(function () {
      fontSizeCache = []

      var i = activeBalloon
      var j = activeRect

      var fontSize = parseInt($(`.balloon${i}.rect${j}`).css('font-size'), 10) + 1
      globalFontSize = fontSize

      $(`.balloon${i}.rect${j}`).css('font-size', fontSize + 'px')
      if (!editMode) {
        renderContent(canvas, i, j, false)
      }
    }, 150)
  }).bind('mouseup mouseleave', function () {
    clearInterval(timeoutId)
  })

  $('#canvasQuickEditor-Shrink').mousedown(function (ev) {
    ev.preventDefault()
    // clear font size cache
    fontSizeCache = []

    const i = activeBalloon
    const j = activeRect

    var fontSize = parseInt($(`.balloon${i}.rect${j}`).css('font-size'), 10) - 1
    globalFontSize = fontSize

    $(`.balloon${i}.rect${j}`).css('font-size', fontSize + 'px')
    if (!editMode) {
      renderContent(canvas, i, j, false)
    }

    timeoutId = setInterval(function () {
      fontSizeCache = []

      const i = activeBalloon
      const j = activeRect

      const fontSize = parseInt($(`.balloon${i}.rect${j}`).css('font-size'), 10) - 1
      globalFontSize = fontSize

      $(`.balloon${i}.rect${j}`).css('font-size', fontSize + 'px')
      if (!editMode) {
        renderContent(canvas, i, j, false)
      }
    }, 150)
  }).bind('mouseup mouseleave', function () {
    clearInterval(timeoutId)
  })

  $('#canvasQuickEditor-Bold').mousedown(function () {
    var i = activeBalloon
    var j = activeRect
    var isBold = $(`.balloon${i}.rect${j}`).css('font-weight')
    if (isBold === 'bold' || isBold === '700' || parseInt(isBold, 10) === 700) {
      $(`.balloon${i}.rect${j}`).css('font-weight', 'normal')
    } else {
      $(`.balloon${i}.rect${j}`).css('font-weight', 'bold')
    }
    if (!editMode) {
      renderContent(canvas, i, j, false)
    }
  })

  $('#canvasQuickEditor-Rotate').mousedown(function (ev) {
    if (!$(this).hasClass('disabled')) {
      ev.preventDefault()
      var i = activeBalloon
      var j = activeRect
      perTextAreaVerticalMode[i][j] = !perTextAreaVerticalMode[i][j]
      var isVertical = perTextAreaVerticalMode[i][j]

      if (isVertical) {
        $(`.balloon${i}.rect${j}`).removeClass('lr-tb')
        $(`.balloon${i}.rect${j}`).addClass('tb-rl')
      } else {
        $(`.balloon${i}.rect${j}`).removeClass('tb-rl')
        $(`.balloon${i}.rect${j}`).addClass('lr-tb')
      }

      const target = getObjectFromId(canvas, i, j)

      if (!editMode) {
        if (isVertical) {
          renderContent(canvas, i, j, target.additionalRect)
          enableCanvasObjectInteraction(canvas, i, j)
        } else {
          renderContent(canvas, i, j, target.additionalRect)
          canvas.remove(target)
          enableCanvasObjectInteraction(canvas, i, j)
        }
        canvas.trigger('object:selected', { target: getObjectFromId(canvas, i, j) })
        canvas.renderAll()
      } else {
        // currently we do nothing.
        // keep cool.
      }
    }
  })

  $('#canvasQuickEditor-Delete').mousedown(function (ev) {
    if (!$(this).hasClass('disabled')) {
      ev.preventDefault()
      const i = activeBalloon
      const j = activeRect
      const target = getObjectFromId(canvas, i, j)
      const additional = target.additionalRect
      canvas.remove(target)
      canvas.remove(additionalTextareaMask[j])
      $(`.balloon${i}.rect${j}`).remove()
      for (let t = j + 1; t < balloonLUTSize[i]; t++) {
        let obj = getObjectFromId(canvas, i, t)
        obj.rectId = t - 1
        if (additional) {
          additionalTextareaMask[t - 1] = additionalTextareaMask[t]
        }
        $(`.balloon${i}.rect${t}`).removeClass(`.rect${t}`).addClass(`rect${t - 1}`)

        // refresh each textarea
        const top = obj.top
        const left = obj.left
        const width = obj.width
        const height = obj.height

        $(`.balloon${i}.rect${t}`).css({
          'top': top + 'px',
          'left': left + 'px',
          'width': width + 'px',
          'height': height + 'px',
          'opacity': 1.0,
          'box-shadow': '0px 0px 2px 1px #66ccff'
        })
      }
      balloonLUTSize[i] -= 1
      console.log(balloonLUTSize[i])
      if (balloonLUTSize[i] === 0 && !additional) {
        const oImg = getObjectFromId(canvas, i, -1)
        console.log(oImg, i, j)
        oImg.set({
          opacity: 0.0,
          selectable: true,
          hoverCursor: 'pointer'
        })
      }
      canvas.discardActiveObject()
      canvas.renderAll()
    }
  })

  // initial editing sequence
  canvas.on('after:render', function () {
    canvas.calcOffset()
  })

  canvas.setHeight(height)
  canvas.setWidth(width)
  perTextAreaVerticalMode = new Array(data.balloonCount + 1)
  balloonLUTSize = new Array(data.balloonCount + 1)

  additionalTextareaMask = []

  for (let i = 0; i < data.balloonCount + 1; i++) {
    perTextAreaVerticalMode[i] = new Array(10)
    balloonLUTSize[i] = 0
  }

  fabric.Image.fromURL(originalImage, function (oImg) {
    canvas.add(oImg)
    canvas.sendToBack(oImg)

    // width -> screenwidth
    let computedScale = (Math.trunc(parseInt($('#previewWrapper').css('width'))) - 1) / (data.dim.cols)
    // console.log(computedScale)
    addBalloonMasks(canvas, data, computedScale)
    zoomTo(canvas, 1 / computedScale)

    canvasBackground = oImg

    $('#balloonChecker').fadeIn()
    $('#previewWrapper').css('border', 'none')
    $('#translateAll').removeClass('disabled')
  }, {
    'left': 0,
    'top': 0,
    'width': data.dim.cols,
    'height': data.dim.rows,
    opacity: 1,
    selectable: false,
    hasControls: false
  })
  canvas.renderAll()
  // ps.update()
}

$(document).ready(function () {
  // process web fonts
  WebFont.load({
    custom: {
      families: ['Noto Sans SC:n4,n7', 'Noto Serif SC:n4,n7', 'Noto Sans TC:n4,n7', 'Noto Serif TC:n4,n7'],
      urls: ['style.css']
    }
  })

  $(window).resize(function () {
    if ($('.canvas-container').length) {
      let computedScale = (Math.trunc(parseInt($('#previewWrapper').css('width'))) - 1) / (canvasBackground.width)
      zoomTo(globalCanvas, 1 / computedScale)
      // ps.update()
    }
  })

  // initialize some variables
  activeBalloon = 0
  activeRect = 0

  editMode = false
  balloonMasks = []

  $('.navItem:first').css({
    'border-bottom': '1px solid #E34F00'
  })

  function getCookie (name) {
    var value = '; ' + document.cookie
    var parts = value.split('; ' + name + '=')
    if (parts.length === 2) return parts.pop().split(';').shift()
  }

  function setlang (lang) {
    if (lang === 'ja') {
      document.cookie = 'lang=ja'
      $('#ocrLang').html("日语 <span class='caret'></span>")
    } else if (lang === 'ko') {
      document.cookie = 'lang=ko'
      $('#ocrLang').html("韩语 <span class='caret'></span>")
    } else if (lang === 'en') {
      document.cookie = 'lang=en'
      $('#ocrLang').html("英语 <span class='caret'></span>")
    } else {
      document.cookie = 'lang=unk'
      $('#ocrLang').html("检测语言 <span class='caret'></span>")
    }
  }

  $('#openGomiBox ').css('margin-top', '50px')

  if (getCookie('lang')) {
    setlang(getCookie('lang'))
  } else {
    document.cookie = 'lang=ja'
  }

  // new type of file upload handler.

  $('#fileupload').fileupload({
    url: '/mangaEditor/upload/',
    sequentialUploads: true,
    type: 'POST',
    error: function (e, data) {
      alert(`出现错误，请重试！${data}`)
    },
    progressall: function (e, data) {
      var progress = parseInt(data.loaded / data.total * 100, 10)
      $('#progress .bar').css(
        'width', progress + '%'
      )
    }
  })

  var imgArr = [
    'img/intro-1.png',
    'img/intro-2.png'
  ]

  var preloadArr = []

  /* preload images */
  for (var i = 0; i < imgArr.length; i++) {
    preloadArr[i] = new Image()
    preloadArr[i].src = imgArr[i]
  }

  $('#fileupload').bind('fileuploadadd', function () {
    function changeImg () {
      $('#dropbox').css('background-image', 'url(' + preloadArr[currImg++ % preloadArr.length].src + ')')
    }
    var currImg = 1
    changeImg()
  })

  $('#fileupload').bind('fileuploaddone', function (e, file) {
    // $("div.actions").fadeIn();

    // initialize and render canvas -> async
    var rawfile = file.files[0]
    var reader = new FileReader(rawfile)
    reader.readAsDataURL(rawfile)
    reader.onload = function (e) {
      fileDetails = $.parseJSON(file.result)
      var data = e.target.result
      originalImage = data
      fileDetails.type = rawfile.type
      var canvas = new fabric.Canvas('balloonChecker', {
        renderOnAddRemove: false,
        preserveObjectStacking: true
      })

      // now adding scrollbars
      // ps = new PerfectScrollbar('.canvas-container', {
      //  suppressScrollX: true
      // })

      canvas.selection = false
      let ctx = canvas.getContext('2d')
      ctx.imageSmoothingEnabled = false
      canvas.lowerCanvasEl.getContext('2d').imageSmoothingEnabled = false
      canvas.upperCanvasEl.getContext('2d').imageSmoothingEnabled = false
      globalCanvas = canvas
      initializeBalloonChecker(canvas, fileDetails.dim.cols, fileDetails.dim.rows, originalImage, fileDetails)
    }

    $('#dropbox').fadeOut()
    $('#dropAd').hide()
    setTimeout(function () {
      $('#progress .bar').fadeOut()
    }, 1000)

    $(window).trigger('resize')
  })

  $('div.actions').hide()
  $('#disqus_thread').hide()

  $('#openGomiBox').click(function () {
    $('#disqus_thread').toggle()
  })
  $('.btn-success:first').click(() => {
    $('.bdsharebuttonbox').toggle()
  })

  // page scroll

  // dropbox styles
  $(document).bind('dragover', function (e) {
    var dropZone = $('#dropzone')
    var timeout = window.dropZoneTimeout
    if (!timeout) {
      dropZone.addClass('in')
    } else {
      clearTimeout(timeout)
    }
    var found = false
    var node = e.target
    do {
      if (node === dropZone[0]) {
        found = true
        break
      }
      node = node.parentNode
    } while (node != null)
    if (found) {
      $('#dropbox').css('opacity', '0.7')
    } else {
      $('#dropbox').css('opacity', '1')
    }
    window.dropZoneTimeout = setTimeout(function () {
      window.dropZoneTimeout = null
      $('#dropbox').css('opacity', '1')
    }, 100)
  })
})

// Translations
$('#testTranslation').on('click', function () {
  // console.log(activeBalloon, fileDetails.balloonCount)
  if (!$(this).hasClass('disabled') && activeBalloon < fileDetails.balloonCount) {
    $('#translationIndicator').show()
    let translateData = {
      'id': fileDetails.id,
      'fname': fileDetails[activeBalloon].originalURL.split('/').pop()
    }
    if (getCookie('lang')) {
      translateData.lang = getCookie('lang')
    } else {
      translateData.lang = 'unk'
    }
    $.ajax({
      url: '/mangaEditor/translate/',
      dataType: 'json',
      method: 'POST',
      data: translateData,
      success: function (data) {
        $('#translations #originalText').val(data.text)
        $('#translations #translatedText').val(data.translatedText)
        $('#translationIndicator').fadeOut()
      }
    })
  }
})

// Translations
$('#translateAll').on('click', function () {
  if ($(this).hasClass('disabled')) {
    return
  }

  $('#translationIndicator').show()
  let translateData = {
    'id': fileDetails.id
  }
  if (getCookie('lang')) {
    translateData.lang = getCookie('lang')
  } else {
    translateData.lang = 'unk'
  }
  $.ajax({
    url: '/mangaEditor/translateAll/',
    dataType: 'json',
    method: 'POST',
    data: translateData,
    statusCode: {
      500: function () {
        alert('Internal server error. Please retry.')
      }
    },
    success: function (data) {
      // console.log(data)
      $('textarea#translateAllResults').attr('rows', data.result.length)
      $('textarea#translateAllResults').html('')
      for (let i = 0; i < data.result.length; i++) {
        $('textarea#translateAllResults').append(data.result[i])
        if (i !== data.result.length - 1) {
          $('textarea#translateAllResults').append('\n')
        }
      }
      $('#translationIndicator').fadeOut()

      // bind click event
      $('#translateAllResults').off('click')
      $('#translateAllResults').on('click', function () {
        var t = $('#translateAllResults')[0]
        var currentLine = (t.value.substr(0, t.selectionStart).split('\n').length)
        globalCanvas.trigger('object:selected', { target: balloonMasks[data.orders[currentLine - 1]] })
      })

      $('textarea#translateAllResults').fadeIn()
    }
  })
})

window.addEventListener('selectstart', function (event) {
  event.stopPropagation()
}, true)

/* sweet tracking code */
const analytics = Analytics({
  app: 'mangaEditor',
  version: 140,
  plugins: [
    googleAnalyticsPlugin({
      trackingId: 'UA-49145449-1'
    })
  ]
})
analytics.page()

/// /////////////////////////////////////////
/*
/*    CHANGELOG - By Miaomiao li
/*
////////////////////////////////////////////

Alpha Phase

v 0.1
Initial Release, with this release we can:

+  load image and parse balloons
+  add rectangle to each balloon
+  automatically fill balloon and generate text objects
+  save the work you have done.

v 0.2
Small bug fixes.

+ Enable multiple textarea support.
+ Fix bugs on canvas saving.
+ avoid too small rectangle generated(server side)

v 0.3
Happy new year! It's my pleasure to share this public beta version to my kind friends.

+ Enable font panel with advanced ineractives.
+ A simple stupid resize for small manga input.

v 0.4
I heard the sound of a bell far away. Still happy new year!

+ Finally solved small input error.
+ Smooth canvas object height control. ( avoid text leakage when force adding a rectangle. )
+ Add force textarea routines.
+ Small interactive improve

v 0.5
Public Release

+ Multiple bug fix.

v 0.6
Testing version for future optimization.

+ Add horizontal support
+ Add bold text toggle.
+ Add feature to remove a balloon with error.
+ Global font and size settings.

v 0.7
Testing version of UI & Graphics

+ Revamped uploading boxes.
+ Control bar integration.

v 0.9
Rewritten in Flask

v 1.0
My old code sucks.

+  Totally rewrite code to bootstrap
+  introduce OCR(beta) and Beegle Translation
+  Better frontend design.

v 1.1
Optimize the canvas download logics
Optimize for result clicks
Reduced download file size by enabling jpeg compression
Refined downloaded file name

v 1.1b
Oh my old codes really suck.
Could not be any sucker.
This is the version for everyday use.

Fixed the manual addition routines.
Fixed the rotation bugs.
Changed the manual addition behavior
Fixed the style change bugs
Fixed the min-width weird behavior
Revamp the sidebar rotation styles.
Fixed the bug when clicking to the filled regions may cause the hideen translated text.
Now you cannot try to translated self-defined regions.
Fix the scorlling layout.

v 1.2
New Feature: Extract All texts.

v 1.2a
Show balloon detail when clicking on the textarea.

v 1.3
Optimized for translations

v 1.4
Rewritten with fabricjs 2
Rebuilt with webpack
Integrate with multiple optimizations

Known bugs

+ sidebar style issues
+ balloons with rect > 1 cannot be clicked twice
+ rotation not working actually

TODO:

*Frontend*
+ Line-height for vertical texts.
+ Custom font-css (for advanced users?)
+ Mask half of the balloon when there is multiple rectangles.
+ Search for nearest neighbour to activate, but not in order.
+ Keyboard Shortcuts(CTRL+S/DEL)
+ Single step undo(ctrl+Z)
+ Change font color/background color of manually added regions
+ PWA-fy the website

*Backend*
+ Trying to match font-size with original template
+ Scribble tool (under consideration, maybe wontfix)

*/
