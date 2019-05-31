import Bowser from 'bowser'
import 'jquery-ui'
import 'blueimp-file-upload'
import fabric from 'fabric'
global.jQuery = require('jquery')
require('bootstrap3')

const $ = global.jQuery

var screenWidth = $(window).width()
var screenHeight = $(window).height()
var SCALE_FACTOR = 1.2
var canvasScale = 1

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
  if (typeof fontSizeCache[t] === 'undefined' || f == true) {
    // does not exist
    tDim = measureTextHeight(t, fontSize, fontFamily)
    fontSizeCache[t] = tDim
  } else {
    // does exist
    tDim = fontSizeCache[t]
  }
  return tDim
}

var generatedRects
var textareaLUT
var textareaLUTSize
var additionalTextareaLUT
var balloonMasks = []

var rects = []
var globalCanvas

var activeBalloon
var activeRect

var editMode = false
var verticalMode = true
var perTextAreaVerticalMode

var globalFont = ''
var globalFontSize = 20

function generateGridSystem (canvas, text, width, height, fontSize, fontFamily, fontWeight, type, top, left, textareaId, rectId) {
  console.log(type)

  if (type === true) {
    // feel sorry that Math.trunc() is in ECMAScript 6.
    var rows = Math.floor((height + 1) / fontSize)
    var cursorPos = 0
    var grid = []
    // temporarily solve the half-size character problem.
    text = SBC2DBC(text)

    // instantly compute the cols.
    var cols = 0
    for (var i = 0; i < text.length; i++) {
      let dim = []
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
        originX: 'center',
        originY: 'center'
      })
      texts.push(newText)
    }

    newText = new fabric.Text('\u3000', {
      left: 0,
      top: fontSize,
      fontFamily: fontFamily,
      fontSize: fontSize,
      angle: charAngle,
      originX: 'center',
      originY: 'center'
    })
    texts.push(newText)
    newText = new fabric.Text('\u3000', {
      left: 0,
      bottom: fontSize,
      fontFamily: fontFamily,
      fontSize: fontSize,
      angle: charAngle,
      originX: 'center',
      originY: 'center'
    })
    texts.push(newText)
    newText = new fabric.Text('\u3000', {
      left: width - fontSize,
      bottom: fontSize,
      fontFamily: fontFamily,
      fontSize: fontSize,
      angle: charAngle,
      originX: 'center',
      originY: 'center'
    })
    texts.push(newText)
    newText = new fabric.Text('\u3000', {
      left: width - fontSize,
      bottom: fontSize,
      fontFamily: fontFamily,
      fontSize: fontSize,
      angle: charAngle,
      originX: 'center',
      originY: 'center'
    })
    texts.push(newText)
    var groups = new fabric.Group(texts, {
      left: left,
      top: top
    })

    groups.setControlsVisibility({
      bl: false,
      br: false,
      tl: false,
      tr: false
    })

    if (typeof (textareaLUT[textareaId][rectId]) !== undefined) {
      canvas.remove(textareaLUT[textareaId][rectId])
    }
    textareaLUT[textareaId][rectId] = groups
    // groups.set({lockScalingY : true});
    canvas.add(groups)
    canvas.setActiveObject(groups)
  } else {
    // console.log("here!");
    groups = new fabric.Textbox(text, {
      left: left,
      top: top,
      width: width,
      height: height,
      fontFamily: fontFamily,
      fontSize: fontSize,
      fontWeight: fontWeight
    })

    if (typeof (textareaLUT[textareaId][rectId]) !== undefined) {
      canvas.remove(textareaLUT[textareaId][rectId])
    }
    textareaLUT[textareaId][rectId] = groups
    // groups.set({lockScalingY : true});
    canvas.add(groups)
    canvas.setActiveObject(groups)
  }
}

function enableCanvasObjectDblclickInteraction (canvas, textareaId, rectId) {
  textareaLUT[textareaId][rectId].on('object:click', function () {
    var i = textareaId
    if (i < fileDetails.balloonCount) {
      $('img.listItemImage').attr('src', fileDetails[i].originalURL)
      $('#testTranslation').removeClass('disabled')
    } else {
      $('#testTranslation').addClass('disabled')
    }
  })

  textareaLUT[textareaId][rectId].on('object:dblclick', function () {
    editMode = true

    $('.darkroom-icon-cancel').parent().removeClass('disabled')
    $('.darkroom-icon-rotate-left').parent().removeClass('disabled')
    $('.canvasQuickEditor').css('display', 'inline-block')

    var i = textareaId
    var j = rectId
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

    var waTop = this.top + 50 + 52
    var waLeft = this.left + 30
    var waWidth = this.width
    var waHeight = this.height

    $('.balloon' + i + '.rect' + j).css({
      'top': waTop,
      'left': waLeft,
      'width': waWidth,
      'height': waHeight,
      'opacity': 0.9,
      'box-shadow': '0px 0px 2px 1px #66ccff'
    })

    $('#canvasQuickEditor').css({
      'top': waTop,
      'left': waLeft + waWidth + 10
    })

    $('.balloon' + i + '.rect' + j).show()
    $('.balloon' + i + '.rect' + j).focus()
    $(document).on('click', function (evt) {
      var $tgt = $(evt.target)
      if (!$tgt.is('li,select,option') && !$tgt.is('.balloon' + i + '.rect' + j) && !$tgt.is('.writingArea div')) {
        editMode = false
        renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j)
        $(document).off('click')
      }
    })
    canvas.remove(this)
  })
}

function onObjectSelected (canvas, e, balloonCount) {
  var scaledObject = e.target
  var selected = false
  // find proper textareaID and textrectId

  for (var i = 0; i < fileDetails.balloonCount; i++) {
    // check if balloon masks was selected
    var textareaId = 0
    var rectId = 0
    if (scaledObject === balloonMasks[i] && textareaLUT[i][0] === undefined) {
      console.log('clicked')
      activeBalloon = i
      $('#originalText').val('')
      $('#translatedText').val('')
      $('img.listItemImage').attr('src', fileDetails[i].originalURL)
      $('#testTranslation').removeClass('disabled')
      return
    } else {
      $('#testTranslation').addClass('disabled')
    }
  }

  for (let i = 0; i < balloonCount + 1; i++) {
    for (let j = 0; j < 10; j++) {
      if (scaledObject === textareaLUT[i][j]) {
        textareaId = i
        rectId = j
        selected = true
      }
    }
  }
  if (selected) {
    let i = textareaId
    let j = rectId
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

    var waTop = scaledObject.getTop() + 50
    var waLeft = scaledObject.getLeft()
    var waWidth = scaledObject.getWidth()
    var waHeight = scaledObject.getHeight()

    $('#canvasQuickEditor').css({
      'top': waTop,
      'left': waLeft + waWidth + 10
    })
    $('.balloon' + i + '.rect' + j).css({
      'top': waTop,
      'left': waLeft
    })

    $('#canvasQuickEditor').css({
      'top': waTop,
      'left': waLeft + waWidth + 10
    })
    $('#canvasQuickEditor').show()
  }
}

function onObjectScaled (canvas, e, balloonCount) {
  var scaledObject = e.target
  var selected = false
  // find proper textareaID and textrectId
  var textareaId = 0
  var rectId = 0

  for (let i = 0; i < balloonCount + 1; i++) {
    for (let j = 0; j < 20; j++) {
      if (scaledObject === textareaLUT[i][j]) {
        textareaId = i
        rectId = j
        selected = true
        console.log(i, j)
      }
    }
  }

  let i = textareaId
  let j = rectId
  activeBalloon = i
  activeRect = j

  $('#originalText').val('')
  $('#translatedText').val('')

  var textarea = $('.balloon' + textareaId + '.rect' + rectId)
  var text = textarea.getPreText()
  var fontSize = parseInt(textarea.css('font-size').slice(0, -2), 10)

  var waTop = scaledObject.getTop() + 50
  var waLeft = scaledObject.getLeft()
  var waWidth = scaledObject.getWidth()
  var waHeight = scaledObject.getHeight()

  $('#canvasQuickEditor').css({
    'top': waTop,
    'left': waLeft + waWidth + 10
  })
  $('.balloon' + i + '.rect' + j).css({
    'top': waTop,
    'left': waLeft,
    'width': waWidth,
    'height': waHeight
  })

  generateGridSystem(canvas, text, scaledObject.getWidth(), scaledObject.getHeight(), fontSize, textarea.css('font-family'), textarea.css('font-weight'), perTextAreaVerticalMode[i][j], scaledObject.getTop(), scaledObject.getLeft(), textareaId, rectId)
  enableCanvasObjectDblclickInteraction(canvas, textareaId, rectId)
}

function renderContent (canvas, textarea, textareaId, rectId, rotation) {
  // clear existing instance

  var width = parseInt(textarea.css('width').slice(0, -2), 10)
  var height = parseInt(textarea.css('height').slice(0, -2), 10)
  var left = parseInt(textarea.css('left').slice(0, -2), 10)
  var top = parseInt(textarea.css('top').slice(0, -2), 10)

  console.log(width, height)

  var fontSize = parseInt(textarea.css('font-size').slice(0, -2), 10)

  // fix fabric alignment
  if (rotation !== true) {
    left = left - 30
    top = top - 102
  } else {
    top = top - 53
    left = left
  }

  var i = textareaId
  var j = rectId

  var text = textarea.getPreText()
  generateGridSystem(canvas, text, width, height, fontSize, textarea.css('font-family'), textarea.css('font-weight'), perTextAreaVerticalMode[i][j], top, left, textareaId, rectId)

  enableCanvasObjectDblclickInteraction(canvas, textareaId, rectId)

  $(textarea).hide()
}

// Interface routines

var fileDetails
var firstStageCanvas
var originalImage

function zoomTo (canvas, scale) {
  // TODO limit max cavas zoom out

  SCALE_FACTOR = scale / canvasScale
  canvasScale = scale

  canvas.setHeight(canvas.getHeight() * (1 / SCALE_FACTOR))
  canvas.setWidth(canvas.getWidth() * (1 / SCALE_FACTOR))

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
  }

  canvas.renderAll()
  SCALE_FACTOR = 1.2
}

function addBalloonMasks (canvas, data, i, computedScale) {
  console.log(i)
  if (i === data.balloonCount) {
    $('div.actions ul').click(function () {
      $(this).parent().css('opacity', '0')
    })
  } else {
    fabric.Image.fromURL(data[i].filledMaskURL, function (oImg) {
      // scale image down, and flip it, before adding it onto canvas
      // oImg.scale(0.5).setFlipX(true);
      var i = balloonMasks.length

      oImg.on('object:dblclick', function (e) {
        editMode = true

        $('.darkroom-icon-cancel').parent().removeClass('disabled')
        $('.darkroom-icon-rotate-left').parent().removeClass('disabled')
        $('.canvasQuickEditor').css('display', 'inline-block')

        $('#canvasQuickEditor').show()

        $('img.listItemImage').attr('src', fileDetails[i].originalURL)
        $('#testTranslation').removeClass('disabled')
        $('#originalText').val('')
        $('#translatedText').val('')

        oImg.set({
          opacity: 1.0,
          selectable: false,
          hoverCursor: 'default'
        })

        // check LUT usage for different operations.
        var j = textareaLUTSize[i]
        if (textareaLUTSize[i] < 2 && j < data[i].textRectCount) {
          activeBalloon = i
          activeRect = j

          var tectRectCount = data[i].textRectCount
          var waTop = data[i].textRect[j].y * computedScale + 50 + 52
          var waLeft = data[i].textRect[j].x * computedScale + 30
          var waWidth = data[i].textRect[j].width * computedScale
          var waHeight = data[i].textRect[j].height * computedScale
          var divTemplate = "<div class='tb-rl writingArea balloon" + i + ' rect' + j + "'contenteditable></div>"
          $('div.canvas-container').parent().append(divTemplate)

          var font = $('#canvasQuickEditor select option:selected').val()
          $('.balloon' + i + '.rect' + j).css({
            'top': waTop,
            'left': waLeft,
            'width': waWidth,
            'height': waHeight,
            'font-family': font,
            'box-shadow': '0px 0px 2px 1px #66ccff',
            'font-size': globalFontSize
          })

          if (globalFont != '') {
            $('.balloon' + i + '.rect' + j).css({
              'font-family': globalFont
            })
          }

          $('#canvasQuickEditor').css({
            'top': waTop,
            'left': waLeft + waWidth + 10
          })

          $('.balloon' + i + '.rect' + j).focus()
          perTextAreaVerticalMode[i][j] = true

          $(document).on('click', function (evt) {
            var $tgt = $(evt.target)
            if (!$tgt.is('li,select,option') && !$tgt.is('.balloon' + i + '.rect' + j) && !$tgt.is('.writingArea div')) {
              editMode = false
              renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j)
              $(document).off('click')
            }
          })

          textareaLUTSize[i] += 1
        } else {
          if (data[i].balloonCount === 1) {
            j = 0
          } else {
            j = 1
          }

          activeBalloon = i
          activeRect = j

          $('#originalText').val('')
          $('#translatedText').val('')

          tectRectCount = data[i].textRectCount
          waTop = data[i].textRect[j].y * computedScale + 50 + 52
          waLeft = data[i].textRect[j].x * computedScale + 30
          waWidth = data[i].textRect[j].width * computedScale
          waHeight = data[i].textRect[j].height * computedScale
          divTemplate = "<div class='tb-rl writingArea balloon" + i + ' rect' + j + "'contenteditable></div>"

          // remove the last rect.
          let font = $('#canvasQuickEditor select option:selected').val()
          $('.balloon' + i + '.rect' + j).css({
            'top': waTop,
            'left': waLeft,
            'width': waWidth,
            'height': waHeight,
            'font-family': font,
            'box-shadow': '0px 0px 2px 1px #66ccff'
          })
          $('#canvasQuickEditor').css({
            'top': waTop,
            'left': waLeft + waWidth + 10
          })

          $('.balloon' + i + '.rect' + j).focus()
          $(document).on('click', function (evt) {
            var $tgt = $(evt.target)
            if (!$tgt.is('li,select,option') && !$tgt.is('.balloon' + i + '.rect' + j) && !$tgt.is('.writingArea div')) {
              editMode = false
              renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j)
              $(document).off('click')
            }
          })
        }
      })
      balloonMasks.push(oImg)
      canvas.add(oImg)
      addBalloonMasks(canvas, data, i + 1, computedScale)
      // canvas.bringToFront(oImg);
    }, {
      'left': data[i].boundingRect.x * computedScale,
      'top': data[i].boundingRect.y * computedScale,
      'width': data[i].boundingRect.width * computedScale,
      'height': data[i].boundingRect.height * computedScale,
      opacity: 0.10,
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
    canvas.deactivateAll().renderAll()

    var height = $('.lower-canvas').attr('width')
    var width = $('.lower-canvas').attr('height')

    var ctx = canvas.getContext('2d')
    ctx.imageSmoothingEnabled = false

    canvas.lowerCanvasEl.getContext('2d').imageSmoothingEnabled = false
    canvas.upperCanvasEl.getContext('2d').imageSmoothingEnabled = false

    $('.lower-canvas').attr('width', $('.upper-canvas').attr('width'))
    $('.lower-canvas').attr('height', $('.upper-canvas').attr('height'))
    canvas.renderAll()

    d = document.getElementById('balloonChecker').toDataURL(data.type)
    console.log(data)
    console.log(data.type)
    // var strDataURI = d.substr(22, d.length);
    // var w=window.open('about:blank','image from canvas');
    // w.document.write("<img src='"+d+"' alt='from canvas'/>");

    var blob = dataURLtoBlob(d)
    var objurl = URL.createObjectURL(blob)

    $('#saveImg')[0].href = objurl
    $('#saveImg')[0].download = 'e-' + data.fileName.substring(data.fileName.lastIndexOf('/') + 1)
    $('#saveImg')[0].click()

    $('.lower-canvas').attr('width', width)
    $('.lower-canvas').attr('height', height)

    zoomTo(canvas, originalScale)
  })

  canvas.on('selection:cleared', function (e) {
    if (!editMode) {
      $('.darkroom-icon-cancel').parent().addClass('disabled')
      $('.darkroom-icon-rotate-left').parent().addClass('disabled')
      $('.canvasQuickEditor').css('display', 'none')
    }
  })
  canvas.on('object:selected', function (e) {
    $('.darkroom-icon-cancel').parent().removeClass('disabled')
    $('.darkroom-icon-rotate-left').parent().removeClass('disabled')
    $('.canvasQuickEditor').css('display', 'inline-block')
  })

  // trigger add routine
  $('.darkroom-icon-add').parent().click(function (ev) {
    ev.preventDefault()

    // add a mouse down trigger.
    var rect, isDown, origX, origY

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
        var j = textareaLUTSize[i]
        editMode = true

        // currently 10 more manual rect supported.
        // this can be set manually.
        // However, 10 is enough. I think.

        var j = textareaLUTSize[i]
        activeBalloon = i
        activeRect = j

        $('#originalText').val('')
        $('#translatedText').val('')

        var pointer = canvas.getPointer(o.e)

        var waTop = rect.top
        var waLeft = rect.left
        var waWidth = Math.abs(origX - pointer.x)
        var waHeight = Math.abs(origY - pointer.y)
        var divTemplate = "<div class='tb-rl writingArea balloon" + i + ' rect' + j + "'contenteditable></div>"
        $('div.canvas-container').parent().append(divTemplate)
        $('.balloon' + i + '.rect' + j).css({
          'top': waTop + 102,
          'left': waLeft + 30,
          'width': waWidth,
          'height': waHeight,
          'min-height': waHeight,
          'box-shadow': '0px 0px 2px 1px #66ccff'
        })

        $('#canvasQuickEditor').show()
        $('#canvasQuickEditor').css({
          'top': waTop,
          'left': waLeft + waWidth + 10
        })

        var newRect2 = new fabric.Rect({
          left: rect.left,
          top: rect.top,
          fill: 'rgba(255,255,255,1.0)',
          width: rect.width,
          height: rect.height,
          selectable: false,
          hasControls: false
        })
        canvas.add(newRect2)
        additionalTextareaMask[j] = newRect2

        perTextAreaVerticalMode[i][j] = true

        $('.balloon' + i + '.rect' + j).focus()

        $(document).on('mousedown', function (evt) {
          var $tgt = $(evt.target)
          if (!$tgt.is('li,select,option') && !$tgt.is('.balloon' + i + '.rect' + j) && !$tgt.is('.writingArea div')) {
            editMode = false
            renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j)

            $(document).off('mousedown')
          }
        })

        textareaLUTSize[i] += 1
        canvas.remove(rect)
      }
    }

    canvas.on('mouse:down', addRectMouseDown)
    canvas.on('mouse:move', addRectMouseMove)
    canvas.on('mouse:up', addRectMouseUp)
  })

  // append quick editor

  $('.darkroom-toolbar button').click(function (ev) {
    ev.preventDefault()
  })
  // $("#steps-uid-0-p-1 div.canvas-container").parent().append("<div id='canvasQuickEditor'><ul><li id='canvasQuickEditor-Font'><select><option value='Simhei'>黑体</option><option value='Simsun'>宋体</option><option value='幼圆'>幼圆</option><option value='方正卡通简体'>方正卡通简体</option><option value='方正正黑'>方正正黑</option><option value='Microsoft Yahei'>微软雅黑</option><option value='Hiragino Sans GB'>柊野非衬线-GB</option></select></li><li id='canvasQuickEditor-Enlarge'>T+</li><li id='canvasQuickEditor-Shrink'>T-</li><li id='canvasQuickEditor-Bold'>B</li><li id='canvasQuickEditor-Rotate'>R</li><li id='canvasQuickEditor-Delete'>X</li></ul></div>");
  $('#canvasQuickEditor-Font select').change(function () {
    var i = activeBalloon
    var j = activeRect
    var font = $('#canvasQuickEditor-Font select option:selected').val()
    globalFont = font
    $('.balloon' + i + '.rect' + j).css('font-family', font)
    if (!editMode) {
      renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
    }
  })

  var timeoutId = 0

  $('#canvasQuickEditor-Enlarge').mousedown(function (ev) {
    ev.preventDefault()
    // clear font size cache
    fontSizeCache = []

    var i = activeBalloon
    var j = activeRect

    var top = $('#canvasQuickEditor').css('top') + 102
    var left = $('#canvasQuickEditor').css('left') + 30

    var fontSize = parseInt($('.balloon' + i + '.rect' + j).css('font-size'), 10) + 1
    globalFontSize = fontSize

    $('.balloon' + i + '.rect' + j).css('font-size', fontSize + 'px')
    if (!editMode) {
      renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
    }
    $('#canvasQuickEditor').css({
      'top': top,
      'left': left
    })

    timeoutId = setInterval(function () {
      fontSizeCache = []

      var i = activeBalloon
      var j = activeRect

      var top = $('#canvasQuickEditor').css('top') + 102
      var left = $('#canvasQuickEditor').css('left') + 30

      var fontSize = parseInt($('.balloon' + i + '.rect' + j).css('font-size'), 10) + 1
      globalFontSize = fontSize

      $('.balloon' + i + '.rect' + j).css('font-size', fontSize + 'px')
      if (!editMode) {
        renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
      }
    }, 150)
  }).bind('mouseup mouseleave', function () {
    clearInterval(timeoutId)
  })

  $('#canvasQuickEditor-Shrink').mousedown(function (ev) {
    ev.preventDefault()
    // clear font size cache
    fontSizeCache = []

    var i = activeBalloon
    var j = activeRect

    var top = $('#canvasQuickEditor').css('top')
    var left = $('#canvasQuickEditor').css('left')

    var fontSize = parseInt($('.balloon' + i + '.rect' + j).css('font-size'), 10) - 1
    globalFontSize = fontSize

    $('.balloon' + i + '.rect' + j).css('font-size', fontSize + 'px')
    if (!editMode) {
      renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
    }
    $('#canvasQuickEditor').css({
      'top': top,
      'left': left
    })

    timeoutId = setInterval(function () {
      fontSizeCache = []

      var i = activeBalloon
      var j = activeRect

      var top = $('#canvasQuickEditor').css('top')
      var left = $('#canvasQuickEditor').css('left')

      var fontSize = parseInt($('.balloon' + i + '.rect' + j).css('font-size'), 10) - 1
      globalFontSize = fontSize

      $('.balloon' + i + '.rect' + j).css('font-size', fontSize + 'px')
      if (!editMode) {
        renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
      }
      $('#canvasQuickEditor').css({
        'top': top,
        'left': left
      })
    }, 150)
  }).bind('mouseup mouseleave', function () {
    clearInterval(timeoutId)
  })

  $('#canvasQuickEditor-Bold').mousedown(function (e) {
    var i = activeBalloon
    var j = activeRect
    var isBold = $('.balloon' + i + '.rect' + j).css('font-weight')
    if (isBold == 'bold' || isBold == '700' || parseInt(isBold, 10) == 700) {
      $('.balloon' + i + '.rect' + j).css('font-weight', 'normal')
    } else {
      $('.balloon' + i + '.rect' + j).css('font-weight', 'bold')
    }
    if (!editMode) {
      renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
    }
  })

  $('#canvasQuickEditor-Rotate').mousedown(function (ev) {
    if (!$(this).hasClass('disabled')) {
      ev.preventDefault()
      var i = activeBalloon
      var j = activeRect
      var isVertical = perTextAreaVerticalMode[i][j]
      perTextAreaVerticalMode[i][j] = !perTextAreaVerticalMode[i][j]

      if (isVertical) {
        $('.balloon' + i + '.rect' + j).removeClass('tb-rl')
        $('.balloon' + i + '.rect' + j).addClass('lr-tb')
      } else {
        $('.balloon' + i + '.rect' + j).removeClass('lr-tb')
        $('.balloon' + i + '.rect' + j).addClass('tb-rl')
      }

      if (!editMode) {
        renderContent(canvas, $('.balloon' + i + '.rect' + j), i, j, true)
      }
    }
  })

  $('#canvasQuickEditor-Delete').mousedown(function (ev) {
    if (!$(this).hasClass('disabled')) {
      ev.preventDefault()
      var i = activeBalloon
      var j = activeRect

      if (i != fileDetails.balloonCount) {
        for (var t = 0; t < textareaLUTSize[i]; t++) {
          $('.balloon' + i + '.rect' + t).remove()
          canvas.remove(textareaLUT[i][t])
        }

        textareaLUT[i].length = 0
        textareaLUT[i] = Array(10)
        textareaLUTSize[i] = 0
        balloonMasks[i].set({
          opacity: 0.1,
          selectable: true,
          hoverCursor: 'pointer'
        })
        canvas.renderAll()

        $('#canvasQuickEditor').hide()
      } else {
        canvas.remove(textareaLUT[i][j])

        canvas.remove(additionalTextareaMask[j])
        textareaLUTSize[i] -= 1
        for (var t = j; t < textareaLUTSize; t++) {
          textareaLUT[i][t] = textareaLUT[i][t + 1]

          additionalTextareaMask[t] = additionalTextareaMask[t + 1]

          // refresh each textarea
          var obj = textareaLUT[i][t]
          var waTop = obj.top + 52
          var waLeft = obj.left
          var waWidth = obj.width
          var waHeight = obj.height

          $('.balloon' + i + '.rect' + t).css({
            'top': waTop,
            'left': waLeft,
            'width': waWidth,
            'height': waHeight,
            'opacity': 0.9,
            'box-shadow': '0px 0px 2px 1px #66ccff'
          })
        }
        $('#canvasQuickEditor').hide()
      }
    }
  })

  // initial editing sequence
  var loadedImageCount = 0
  canvas.on('after:render', function () {
    canvas.calcOffset()
  })
  canvas.on('object:scaling', function (ev) {
    onObjectScaled(canvas, ev, data.balloonCount)
  })
  canvas.on('object:selected', function (ev) {
    onObjectSelected(canvas, ev, data.balloonCount)
  })
  canvas.on('object:moving', function (ev) {
    onObjectSelected(canvas, ev, data.balloonCount)
  })
  canvas.setHeight(height)
  canvas.setWidth(width)

  textareaLUT = new Array(data.balloonCount)
  perTextAreaVerticalMode = new Array(data.balloonCount + 1)

  let additionalTextareaMask = new Array(20)
  let textareaLUTSize = []
  for (let i = 0; i < data.balloonCount + 1; i++) {
    textareaLUT[i] = new Array(20)
    textareaLUTSize.push(0)
    perTextAreaVerticalMode[i] = new Array(20)
  }

  fabric.Image.fromURL(originalImage, function (oImg) {
    canvas.add(oImg)
    canvas.sendToBack(oImg)
    // loadedImageCount += 1;
    // if(loadedImageCount == data.balloonCount + 1)
    // {
    let computedScale = (screenWidth * 0.46667 - 62) / width
    console.log(computedScale)
    addBalloonMasks(canvas, data, 0, computedScale)
    zoomTo(canvas, 1 / computedScale)

    $('#balloonChecker').fadeIn()
    $('#translateAll').removeClass('disabled')
    // }
  }, {
    'left': 0,
    'top': 0,
    'width': data.dim.cols,
    'height': data.dim.rows,
    opacity: 1,
    selectable: false,
    hasControls: false
  })
}

$(document).ready(function () {
  $('.navItem:first').css({
    'border-bottom': '1px solid #E34F00'
  })

  var viewportWidth = $(window).width()
  var viewportHeight = $(window).height()

  if (viewportHeight <= 620) {
    $('#centerDisp').css({
      'padding-top': 620 - viewportHeight + 'px'
    })
  }

  $(window).resize(function () {
    viewportWidth = $(window).width()
    viewportHeight = $(window).height()
    if (viewportHeight <= 620) {
      $('#centerDisp').css({
        'padding-top': 620 - viewportHeight + 'px'
      })
    } else {
      $('#centerDisp').css({
        'padding-top': 0 + 'px'
      })
    }
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
    url: 'upload/',
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

  $('#fileupload').bind('fileuploadadd', function (e, file) {
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
    // console.log(file);
    var reader = new FileReader(rawfile)
    reader.readAsDataURL(rawfile)
    reader.onload = function (e) {
      fileDetails = $.parseJSON(file.result)
      var data = e.target.result
      originalImage = data
      fileDetails.type = rawfile.type
      var canvas = new fabric.CanvasEx('balloonChecker')
      globalCanvas = canvas
      initializeBalloonChecker(canvas, fileDetails.dim.cols, fileDetails.dim.rows, originalImage, fileDetails)
    }

    $('#dropbox').fadeOut()
    $('#dropAd').hide()
    setTimeout(function () {
      $('#progress .bar').fadeOut()
    }, 1000)
  })

  $('div.actions').hide()
  $('#disqus_thread').hide()

  $('#openGomiBox').click(function () {
    $('#disqus_thread').toggle()
  })

  // page scroll
  var verticalFlag = false
  $(document).scroll(function () {
    var d = $(document).scrollTop()
    // console.log(d);
    if (d > 350) {
      verticalFlag = true
      if (verticalFlag) {
        $('#balloonCheckerTooltipList').css({
          'position': 'fixed',
          'top': '30px',
          'width': '40%'
        })
      }
    } else {
      if (verticalFlag) {
        verticalFlag = false
        $('#balloonCheckerTooltipList').css({
          'position': 'relative',
          'top': '0px',
          'width': 'auto'
        })
      }
    }
  })

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
$('#testTranslation').on('click', function (e) {
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
      url: 'translate/',
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
$('#translateAll').on('click', function (e) {
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
    url: 'translateAll/',
    dataType: 'json',
    method: 'POST',
    data: translateData,
    statusCode: {
      500: function () {
        alert('Internal server error. Please retry.')
      }
    },
    success: function (data) {
      console.log(data)
      $('textarea#translateAllResults').attr('rows', data.result.length)
      $('textarea#translateAllResults').html('')
      for (var i = 0; i < data.result.length; i++) {
        $('textarea#translateAllResults').append(data.result[i])
        if (i != data.result.length - 1) {
          $('textarea#translateAllResults').append('\n')
        }
      }
      $('#translationIndicator').fadeOut()

      // bind click event
      $('#translateAllResults').off('click')
      $('#translateAllResults').on('click', function (ev) {
        var t = $('#translateAllResults')[0]
        var currentLine = (t.value.substr(0, t.selectionStart).split('\n').length)
        globalCanvas.setActiveObject(balloonMasks[data.orders[currentLine - 1]])
      })

      $('textarea#translateAllResults').fadeIn()
    }
  })
});

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

Known bugs

+ sidebar style issues
+ CORS ajax support for firefox failed.

TODO:

+ Trying to match font-size with original template
+ Redesign text editing logic.
+ Escape for special characters.
+ Line-height for vertical texts.
+ Sidebar panel off-site editing.
+ Mask half of the balloon when there is multiple rectangles.
+ Search for nearest neighbour to activate, but not in order.
+ Shortcuts
+ Mask only half of the balloon, when there are multiple candidates.
+ Server optimization
+ Scribble tool ( under consideration )

*/

/* sweet tracking code */

(function (i, s, o, g, r, a, m) {
  i['GoogleAnalyticsObject'] = r
  i[r] = i[r] || function () {
    (i[r].q = i[r].q || []).push(arguments)
  }, i[r].l = 1 * new Date()
  a = s.createElement(o),
  m = s.getElementsByTagName(o)[0]
  a.async = 1
  a.src = g
  m.parentNode.insertBefore(a, m)
})(window, document, 'script', '//www.google-analytics.com/analytics.js', 'ga')

ga('create', 'UA-49145449-1', 'auto')
ga('send', 'pageview')
