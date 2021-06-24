const default_fill = '#ffffffff';
const default_stroke = '#808080ff';
const default_stroke_width = 2;
const mediaSource = new MediaSource();
mediaSource.addEventListener('sourceopen', handleVideoSourceOpen, false);

let circle_counter = 0;
let rect_counter = 0;
let brush_counter = 0;
let text_counter = 0;
let recording_array = [];
let audioChunks = [];
let peerDataConnections = [];
let peerDataLastIndex = [];
let peerStreamConnections = [];
let myId = 0;
let isRecording = false;
let hasAudioPermission = false;
let audioRecorder = null;
let audioblob = null;

let canvasStream = null;
let mediaRecorder = null;
let recordedBlobs = null;
let sourceBuffer = null;

// handling source open for media source(video recording)
function handleVideoSourceOpen(event) {
  console.log(`MediaSource Opened`);
  sourceBuffer = mediaSource.addSourceBuffer('video/webm; codecs="vp8"');
  console.log('Source Buffer:', sourceBuffer);
}

// updating video blob as and when available
function handleVideoDataAvailable(event) {
  if(event.data && event.data.size > 0) {
    recordedBlobs.push(event.data);
  }
}

// stopping video recording
function handleVideoStop(event) {
  console.log('Recorder stopped: ', event);
  // const superBuffer = new Blob(recordedBlobs, {type:'video/webm'});
  // video.src = window.URL.createObjectURL(superBuffer);
}

// setting up observability for recording array to update push results to peers
recording_array.push = function() {
  let len = Array.prototype.push.apply(this, arguments);
  for(let i=0; i<peerDataConnections.length; i++) {
    let conn = peerDataConnections[i];
    let new_chalkings = recording_array.slice(peerDataLastIndex[i]);
    conn.send(new_chalkings);
    peerDataLastIndex[i]=len;
  }
  return len;
};


const record_button = document.getElementById("recordBtn");
let last_activity_timestamp = 0;

/**
 * ********************************************
 * ********************************************
 * **********All Audio and Peer Code***********
 * ********************************************
 * ********************************************
 */

function handleDataAvailable(event) {
  // console.log('data available called with data of size: ', event.data.size);
  if(event.data.size > 0) audioChunks.push(event.data);
}

function generate_audio_blob(event) {
  // audioRecorder.requestData();
  // console.log('before blob generation:', audioRecorder.state);
  audioblob = new Blob(audioChunks, {
    'type' : 'audio/webm;codecs=opus'
  });
}

if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
  navigator.mediaDevices.getUserMedia({audio: true, video: false})
  .then(function(stream) {
    audioRecorder = new MediaRecorder(stream, {mimeType: 'audio/webm;codecs=opus'});
    console.log(audioRecorder.mimeType);
    audioRecorder.ondataavailable = handleDataAvailable;
    audioRecorder.onstop = generate_audio_blob;
    hasAudioPermission=true;
  })
  .catch(function(err) {
    console.error(`Error while trying to fetch microphone access: `, err);
  });
} else {
  console.error(`getUserMedia not supported in your browser`);
}

const peer = new Peer();
// console.log(peer);
peer.on('error', function(err) {
  console.error(`PeerJS object creation error:`, err);
});
peer.on('open', function(id) {
  myId=id;
  console.log('id=', id);
  document.getElementById('myId').innerHTML = myId;
  
  peer.on('connection', function(conn) {
  
    console.log(`Connection opened with peer id: ${conn.peer}`);
    peerDataConnections.push(conn);
    peerDataLastIndex.push(0);
    let idx = peerDataConnections.length-1;
    
    conn.on('close', () => {
      peerDataConnections.splice(idx, 1);
      peerDataLastIndex.splice(idx, 1);
    });
  
    conn.on('open', () => {
      
      if(isRecording && recording_array.length>0) {
        conn.send(recording_array);
        peerDataLastIndex[idx] = recording_array.length;
      } 
    });
  });
  
  peer.on('call', function(call) {
    peerStreamConnections.push(call);
    console.log('stream being sent:', audioRecorder.stream);
    call.answer(audioRecorder.stream);
    // call.on('open', function() {
      call.on('stream', function(stream) {
        console.log('remote stream:', stream);
      });
    // });
    let idx = peerDataConnections.length-1;
    
    // call.on('open', function() {
      console.log(`Audio Connection opened with peer id: ${call.peer}`);
    // });
    call.on('close', () => {
      peerStreamConnections.splice(idx, 1);
    });
  });
  

});


/**
 * *************************************************
 * ********Audio and Peer Connections end***********
 * *************************************************
 */

let stage = new Konva.Stage({
    container: 'container',
    width:1080,
    height:576,

});

function fitStageIntoParentContainer() {
  let container = document.querySelector('#container');

  // now we need to fit stage into parent
  let containerWidth = container.offsetWidth;
  // to do this we need to scale the stage
  let scale = containerWidth / stage.width();

  stage.width(stage.width() * scale);
  stage.height(stage.height() * scale);
  stage.scale({ x: scale, y: scale });
  stage.draw();
}

fitStageIntoParentContainer();
// adapt the stage on any window resize
window.addEventListener('resize', fitStageIntoParentContainer);


let layer = new Konva.Layer();
let mouse_mode='pointer';

let layerBackgroundRect = new Konva.Rect({
    x : 0, y : 0,
    width: stage.width(), height:stage.height(),
    fill:'black',
    draggable:false,
    listening:true
});
layer.add(layerBackgroundRect);


let selected_transformer = new Konva.Transformer({
    nodes:[],
    rotateAnchorOffset : 60,
    enabledAnchors: ['top-left', 'top-right', 'bottom-left', 'bottom-right', 'middle-left',
                        'middle-right', 'top-center', 'bottom-center'],
});

layer.add(selected_transformer);
layerBackgroundRect.on('mousedown touchstart click', function(e) {
    switch(mouse_mode) {
        case 'pointer' : selected_transformer.nodes([]); break;
        case 'rectangle': addRectangle(); break;
        case 'circle' : addCircle(); break;
        case 'brush' : useBrush(); break;
        // case 'eraser' : useEraser(); break;
        case 'text': addText(); break;
        default: selected_transformer.nodes([]); break;
    }
    selected_transformer.moveToTop();
    menuNode.style.display='none';
    layer.draw();
});

// let circle = new Konva.Circle({
//     x : stage.width() / 2,
//     y : stage.height() / 2,
//     radius : 70,
//     // fill : 'red',
//     // stroke : 'black',
//     fill : default_fill,
//     stroke: default_stroke,
//     strokeWidth : 4,
//     draggable:true,
//     listening:true
// });

// layer.add(circle);
// circle.on('mousedown touchstart', function(e){
//     selected_transformer.nodes([circle]);
// });

// let line = new Konva.Line({
//     x:100,
//     y:50,
//     points:[73, 70, 340, 23, 450, 60, 500, 20],
//     stroke:'red',
//     tension:0.0001,
//     draggable:true,
//     listening:true
// });
// layer.add(line);
// line.on('mousedown touchstart', function() {
//     selected_transformer.nodes([line]);
// });

// let text = new Konva.Text({
//     x: 10,
//     y: 15,
//     text: 'Simple Text',
//     fontSize: 30,
//     fontFamily: 'Calibri',
//     fill: 'green',
//     draggable:true
// });
// text.on('mousedown touchstart', function() {
//     selected_transformer.nodes([text]);
// });
// text.on('dblclick', function() {

// });
// layer.add(text);



stage.add(layer);
layer.draw();

const circleBtn = document.getElementById('circle-btn');
const rectangleBtn = document.getElementById('rectangle-btn');
const brushBtn = document.getElementById('brush-btn');
const eraserBtn = document.getElementById('eraser-btn');
const pointerBtn = document.getElementById('pointer-btn');
const textBtn = document.getElementById('text-btn');
const laserBtn = document.getElementById('laser-btn');

circleBtn.addEventListener('click', (e) => {
    mouse_mode='circle';
    stage.off('mousemove');
    stage.off('mouseenter');
    stage.off('mouseleave');
    // if(isRecording) recording_array.push(`${Date.now()} mouse_mode circle`);
    menuNode.style.display='none';
});
rectangleBtn.addEventListener('click', (e) => {
  mouse_mode='rectangle';
  stage.off('mousemove');
  stage.off('mouseenter');
  stage.off('mouseleave');
  // if(isRecording) recording_array.push(`${Date.now()} mouse_mode rectangle`);
  menuNode.style.display='none';
});
brushBtn.addEventListener('click', (e) => {
  mouse_mode='brush';
  stage.off('mousemove');
  stage.off('mouseenter');
  stage.off('mouseleave');
  menuNode.style.display='none';
});
eraserBtn.addEventListener('click', (e) => {
  mouse_mode='eraser';
  stage.off('mousemove');
  stage.off('mouseenter');
  stage.off('mouseleave');
  menuNode.style.display='none';
});
pointerBtn.addEventListener('click', (e) => {
  mouse_mode='pointer';
  stage.off('mousemove');
  stage.off('mouseenter');
  stage.off('mouseleave');
  menuNode.style.display='none';
});
textBtn.addEventListener('click', (e) => {
  mouse_mode='text';
  stage.off('mousemove');
  stage.off('mouseenter');
  stage.off('mouseleave');
  menuNode.style.display='none';
});
laserBtn.addEventListener('click', (e) => {
    // console.log('laser button clicked');
    mouse_mode='laser';
    let laser = new Konva.Circle({
        x: 0,
        y: 0,
        radius : 5,
        fill : '#ff0000dd',
        draggable:true,
        listening:true
    });
    layer.add(laser);
    
    if(isRecording) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "create",
        shape: "laser",
        id: "laser",
        attrs : {
          x: 0,
          y: 0,
          radius : 5,
          id: "laser",
          fill : '#ff0000dd',
          draggable:false,
          listening:false
        }
      });
    }

    stage.on('mousemove', function() {
      
        let pos = stage.getPointerPosition();
        menuNode.style.display='none';
        laser.x(pos.x);
        laser.y(pos.y);
        laser.moveToTop();
        if(isRecording) {
          recording_array.push({
            ts: Date.now()-last_activity_timestamp,
            type: "mousemove",
            id: "laser",
            attrs : {
              x: pos.x,
              y: pos.y
            }
          });
        }
        layer.draw();
    });
    stage.on('mouseenter', function() {
        let pos = stage.getPointerPosition();
        laser.x(pos.x);
        laser.y(pos.y);
        laser.fill('#ff0000dd');
        laser.moveToTop();
        if(isRecording) {
          recording_array.push({
            ts: Date.now()-last_activity_timestamp,
            type: "mouseenter",
            id: "laser",
            attrs : {
              x: pos.x,
              y: pos.y
            }
          });

          recording_array.push({
            ts: Date.now() - last_activity_timestamp,
            type: "moveToTop",
            id: "laser"
          });
        }
        layer.draw();
    });
    stage.on('mouseleave', function() {
        let pos = stage.getPointerPosition();
        laser.x(pos.x);
        laser.y(pos.y);
        laser.fill('#ff000000');
        laser.moveToTop();
        if(isRecording) {
          recording_array.push({
            ts: Date.now() - last_activity_timestamp,
            type: "mouseleave",
            id: "laser",
            attrs : {
              x: pos.x,
              y: pos.y
            }
          });

          recording_array.push({
            ts: Date.now() - last_activity_timestamp,
            type: "moveToTop",
            id: "laser"
          });
        }
        layer.draw();
    });
    menuNode.style.display='none';
    layer.draw();
});

function addRectangle() {
    // console.log('rectangle button clicked');
    let pos = stage.getPointerPosition();
    let rect_id=`rect${rect_counter++}`;
    let rect = new Konva.Rect({
        x: pos.x,
        y: pos.y,
        id : rect_id,
        width: 50, height:50,
        fill:'green',
        draggable:true,
        listening:true
    });

    if(isRecording) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "create",
        shape : "rectangle",
        id: rect_id,
        attrs: {
          x : pos.x,
          y : pos.y,
          width: 50, height: 50,
          id: rect_id,
          fill: 'green',
          draggable: true,
          listening:false
        }
      });
    }

    rect.on('dragstart', function(evt) {
      if(isRecording) {

        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type: "dragstart",
          shape: "rectangle",
          id: rect_id,
          attrs: {
            x: rect.x(),
            y: rect.y()
          }
        });
      }
    });

    rect.on('dragmove', function(evt) {
      if(isRecording) {

        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type: "dragmove",
          shape: "rectangle",
          id: rect_id,
          attrs: {
            x: rect.x(),
            y: rect.y()
          }
        });
      }
    });

    rect.on('dragend', function(evt) {
      if(isRecording) {
        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type: "dragend",
          shape: "rectangle",
          id: rect_id,
          attrs: {
            x: rect.x(),
            y: rect.y()
          }
        });
      }
    });

    rect.on('transform', function(evt) {
      // console.log('tranform', rect.getAttrs());
      console.log(selected_transformer.getActiveAnchor());
      if(isRecording) {
        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type: "transform",
          shape: "rectangle",
          id: rect_id,
          attrs: {
            x: rect.x(),
            y: rect.y(),
            scaleX: rect.scaleX(),
            scaleY: rect.scaleY(),
            rotation: rect.rotation(),
            width: rect.width(),
            height: rect.height()
          }
        });
      }
      
    });

    layer.add(rect);
    rect.on('mousedown touchstart', function() {
        selected_transformer.nodes([rect]);
        menuNode.style.display='none';
    });
    selected_transformer.nodes([rect]);
    mouse_mode='pointer';
    menuNode.style.display='none';
}

function addCircle() {
    // console.log('circle button clicked');
    let pos = stage.getPointerPosition();
    let circle_id = `circle${circle_counter++}`;
    let circle = new Konva.Circle({
        x: pos.x,
        y: pos.y,
        id : circle_id,
        radius : 70,
        fill : default_fill,
        stroke : default_stroke,
        strokeWidth : default_stroke_width,
        draggable:true,
        listening:true
    });

    if(isRecording) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "create",
        shape : "circle",
        id: circle_id,
        attrs: {
          x : pos.x,
          y : pos.y,
          radius : 70,
          id: circle_id,
          fill : default_fill,
          stroke : default_stroke,
          strokeWidth : default_stroke_width,
          draggable:true,
          listening:false
        }
      });
    }

    circle.on('dragmove', function() {
      if(isRecording) {
        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type:"dragmove",
          shape:"circle",
          id: circle_id,
          attrs: {
            x: circle.x(),
            y: circle.y()
          }
        });
      }
    });

    circle.on('transform', function() {

      if(isRecording) {
        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type:"transform",
          shape: "circle",
          id: circle_id,
          attrs: {
            x: circle.x(),
            y: circle.y(),
            scaleX: circle.scaleX(),
            scaleY: circle.scaleY(),
            rotation: circle.rotation(),
            width: circle.width(),
            height: circle.height(),
            radius: circle.radius()
          }
        });
      }
    });

    layer.add(circle);
    circle.on('mousedown touchstart', function() {
        selected_transformer.nodes([circle]);
        menuNode.style.display='none';
    });
    selected_transformer.nodes([circle]);
    mouse_mode='pointer';
    menuNode.style.display='none';
}

function useBrush() {
    selected_transformer.nodes([]);
    let isPaint = true;
    let pos = stage.getPointerPosition();
    let brush_id = `brush${brush_counter++}`;
    let lastLine = new Konva.Line({
        stroke:default_stroke,
        id : brush_id,
        strokeWidth:default_stroke_width,
        globalCompositionOperation:'source-over',
        lineJoin: "round",
        lineCap: "round",
        points: [pos.x, pos.y]
    });

    if(isRecording) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "create",
        shape: "brush",
        id: brush_id,
        attrs: {
          stroke: default_stroke,
          strokeWidth: default_stroke_width,
          globalCompositionOperation: 'source-over',
          id: brush_id,
          lineJoin: "round",
          lineCap: "round",
          points: [pos.x, pos.y]
        }
      });
    }

    layer.add(lastLine);
    lastLine.on('mousedown touchstart click', function() {
        if(mouse_mode === 'eraser') {
          lastLine.destroy();
          if(isRecording) {
            recording_array.push({
              ts: Date.now() - last_activity_timestamp,
              type: "destroy",
              shape: "brush",
              id: brush_id,
            });
          }
        }
        menuNode.style.display='none';
    });

    stage.on('mouseup touchend', function() {
        isPaint=true;
        stage.off('mousemove touchmove');
    });

    stage.on('mousemove touchmove', function(e) {
        if(!isPaint) return;
        pos = stage.getPointerPosition();
        let newPoints = lastLine.points().concat([pos.x, pos.y]);
        if(isRecording) {
          recording_array.push({
            ts: Date.now() - last_activity_timestamp,
            type: "append",
            shape: "brush",
            id: brush_id,
            attrs: {
              x: pos.x,
              y: pos.y
            }
          });
        }
        lastLine.points(newPoints);
        layer.batchDraw();
    });
}

// function useEraser(e) {
//   console.log('eraser mouse mode');
//   console.log(`${e.target}`);
//   e.evt.preventDefault();
//   if (e.target === stage) {
//     // if we are on empty place of the stage we will do nothing
//     return;
//   }
//   console.log(e.target);
//   currentShape = e.target;
//   if(currentShape === layerBackgroundRect) return;
//   if(currentShape instanceof Konva.Line) {
//     currentShape.destroy();
//   }
// }

function addText() {
    let pos = stage.getPointerPosition();
    let text_id = `text${text_counter++}`;
    let textNode = new Konva.Text({
        x: pos.x,
        y: pos.y,
        id : text_id,
        text: 'Add Text',
        fontSize: 30,
        fontFamily: 'Calibri',
        fill: default_fill,
        draggable:true,
        listening:true
    });
    layer.add(textNode);
    
    if(isRecording) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "create",
        shape: "text",
        id: text_id,
        attrs: {
          x: pos.x,
          y: pos.y,
          id : text_id,
          text: 'Add Text',
          fontSize: 30,
          fontFamily: 'Calibri',
          fill: default_fill,
          draggable:true,
          listening:false
        }
      });
    }

    textNode.on('mousedown touchstart click tap', function() {
        selected_transformer.nodes([textNode]);
        // selected_transformer.boundBoxFunc = function(oldbox, newbox) {
        //     newbox.width = Math.max(30, oldbox.width);
        //     return newbox;
        // };
    });

    textNode.on('transform', function() {
        let pos = stage.getPointerPosition();
        textNode.setAttrs({
            // fontSize:12
            width: textNode.width() * textNode.scaleX(),
            scaleX: 1,
            height: textNode.height() * textNode.scaleY(),
            scaleY:1,
            rotation: textNode.rotation()
        });
        if(isRecording) {
          recording_array.push({
            ts: Date.now() - last_activity_timestamp,
            type: "transform",
            shape: "text",
            id: text_id,
            attrs: {
              width: textNode.width(),
              scaleX: textNode.scaleX(),
              height: textNode.height(), 
              scaleY: textNode.scaleY(),
              x: textNode.x(),
              y: textNode.y(),
              rotation: textNode.rotation()
            }
          });
        }
    });

    textNode.on('dragmove', function() {
      if(isRecording) {
        recording_array.push({
          ts: Date.now() - last_activity_timestamp,
          type: "dragmove",
          shape: "text",
          id: text_id,
          attrs: {
            x: textNode.x(),
            y: textNode.y()
          }
        });
      }
    });

    
    textNode.on('dblclick dbltap', function() {
                // hide text node and transformer:
                textNode.hide();
                layer.draw();
        
                // create textarea over canvas with absolute position
                // first we need to find position for textarea
                // how to find it?
        
                // at first lets find position of text node relative to the stage:
                let textPosition = textNode.absolutePosition();
        
                // then lets find position of stage container on the page:
                let stageBox = stage.container().getBoundingClientRect();
        
                // so position of textarea will be the sum of positions above:
                var areaPosition = {
                  x: stageBox.left + textPosition.x,
                  y: stageBox.top + textPosition.y,
                };
        
                // create textarea and style it
                var textarea = document.createElement('textarea');
                document.body.appendChild(textarea);
        
                // apply many styles to match text on canvas as close as possible
                // remember that text rendering on canvas and on the textarea can be different
                // and sometimes it is hard to make it 100% the same. But we will try...
                textarea.value = textNode.text();
                textarea.style.position = 'absolute';
                textarea.style.top = window.scrollY + areaPosition.y + 'px';
                textarea.style.left = areaPosition.x + 'px';
                textarea.style.width = textNode.width() - textNode.padding() * 2 + 'px';
                textarea.style.height =
                  textNode.height() - textNode.padding() * 2 + 5 + 'px';
                textarea.style.fontSize = textNode.fontSize() + 'px';
                textarea.style.border = 'none';
                textarea.style.padding = '0px';
                textarea.style.margin = '0px';
                textarea.style.overflow = 'hidden';
                textarea.style.background = 'none';
                textarea.style.outline = 'none';
                textarea.style.resize = 'none';
                textarea.style.lineHeight = textNode.lineHeight();
                textarea.style.fontFamily = textNode.fontFamily();
                textarea.style.transformOrigin = 'left top';
                textarea.style.textAlign = textNode.align();
                textarea.style.color = textNode.fill();
                rotation = textNode.rotation();
                var transform = '';
                if (rotation) {
                  transform += 'rotateZ(' + rotation + 'deg)';
                }
        
                var px = 0;
                // also we need to slightly move textarea on firefox
                // because it jumps a bit
                var isFirefox =
                  navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
                if (isFirefox) {
                  px += 2 + Math.round(textNode.fontSize() / 20);
                }
                transform += 'translateY(-' + px + 'px)';
        
                textarea.style.transform = transform;
        
                // reset height
                textarea.style.height = 'auto';
                // after browsers resized it we can set actual value
                textarea.style.height = textarea.scrollHeight + 3 + 'px';
        
                textarea.focus();
        
                function removeTextarea() {
                  textarea.parentNode.removeChild(textarea);
                  window.removeEventListener('click', handleOutsideClick);
                  textNode.show();
                  layer.draw();
                }
        
                function setTextareaWidth(newWidth) {
                  if (!newWidth) {
                    // set width for placeholder
                    newWidth = textNode.placeholder.length * textNode.fontSize();
                  }
                  // some extra fixes on different browsers
                  var isSafari = /^((?!chrome|android).)*safari/i.test(
                    navigator.userAgent
                  );
                  var isFirefox =
                    navigator.userAgent.toLowerCase().indexOf('firefox') > -1;
                  if (isSafari || isFirefox) {
                    newWidth = Math.ceil(newWidth);
                  }
        
                  var isEdge =
                    document.documentMode || /Edge/.test(navigator.userAgent);
                  if (isEdge) {
                    newWidth += 1;
                  }
                  textarea.style.width = newWidth + 'px';
                }
        
                textarea.addEventListener('keydown', function (e) {
                  // hide on enter
                  // but don't hide on shift + enter
                  if (e.key === 13 && !e.shiftKey) {
                    textNode.text(textarea.value);
                    removeTextarea();
                  }
                  // on esc do not set value back to node
                  if (e.key === 27) {
                    removeTextarea();
                  }
                  if(isRecording) {
                    recording_array.push({
                      ts: Date.now() - last_activity_timestamp,
                      type: "keydown",
                      shape: "text",
                      id: text_id,
                      attrs: {
                        text: textarea.value
                      }
                    });
                  }
                });
        
                textarea.addEventListener('keydown', function (e) {
                  scale = textNode.getAbsoluteScale().x;
                  setTextareaWidth(textNode.width() * scale);
                  textarea.style.height = 'auto';
                  textarea.style.height =
                    textarea.scrollHeight + textNode.fontSize() + 'px';
                });
        
                function handleOutsideClick(e) {
                  if (e.target !== textarea) {
                    textNode.text(textarea.value);
                    removeTextarea();
                    if(isRecording) {
                      recording_array.push({
                        ts: Date.now() - last_activity_timestamp,
                        type: "keydown",
                        shape: "text",
                        id: text_id,
                        attrs: {
                          text: textNode.text()
                        }
                      });
                    }
                  }
                }
                setTimeout(()=>{
                    window.addEventListener('click', handleOutsideClick);
                });
    });
    selected_transformer.nodes([textNode]);
    mouse_mode='pointer';
}

let currentShape;
let menuNode = document.getElementById('menu');
document.getElementById('move-layer-up').addEventListener('click', () => {
  currentShape.moveUp();
  selected_transformer.moveUp();
  if(isRecording) {
    const nodes = selected_transformer.nodes();
    for(let i=0; i<nodes.length; i++) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "moveUp",
        id: nodes[i].id()
      });
    }
  }
  
  layer.draw();
  menuNode.style.display = 'none';
});

document.getElementById('move-layer-down').addEventListener('click', () => {
  currentShape.moveDown();
  selected_transformer.moveDown();
  if(isRecording) {
    const nodes = selected_transformer.nodes();
    for(let i=0; i<nodes.length; i++) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "moveDown",
        id: nodes[i].id()
      });
    }
  }
  layer.draw();
  menuNode.style.display = 'none';
});

document.getElementById('move-to-top').addEventListener('click', () => {
  currentShape.moveToTop();
  selected_transformer.moveToTop();
  if(isRecording) {
    const nodes = selected_transformer.nodes();
    for(let i=0; i<nodes.length; i++) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "moveToTop",
        id: nodes[i].id()
      });
    }
  }
  layer.draw();
  menuNode.style.display = 'none';
});

document.getElementById('move-to-bottom').addEventListener('click', () => {
  currentShape.moveToBottom();
  currentShape.moveUp();
  selected_transformer.moveToBottom();
  selected_transformer.moveUp();
  selected_transformer.moveUp();
  if(isRecording) {
    const nodes = selected_transformer.nodes();
    for(let i=0; i<nodes.length; i++) {
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "moveToBottom",
        id: nodes[i].id()
      });
      recording_array.push({
        ts: Date.now() - last_activity_timestamp,
        type: "moveUp",
        id: nodes[i].id()
      });
    }
  }
  layer.draw();
  menuNode.style.display = 'none';
});

let fillpicker = new Picker(document.getElementById('fill-color'));
fillpicker.onDone = function(color) {
  currentShape.fill(color.rgbaString);
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "fillColor",
      id: currentShape.id(),
      attrs: {
        fill: currentShape.fill()
      }
    });
  }
  layer.draw();
  menuNode.style.display = 'none';
};

let strokepicker = new Picker(document.getElementById('stroke-color'));
strokepicker.onDone = function(color) {
  currentShape.stroke(color.rgbaString);
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "strokeColor",
      id: currentShape.id(),
      attrs: {
        stroke: currentShape.stroke()
      }
    });
  }
  layer.draw();
  menuNode.style.display = 'none';
};

document.getElementById('delete-shape').addEventListener('click', () => {
  currentShape.destroy();
  selected_transformer.nodes([]);
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "destroy",
      id: currentShape.id()
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('left-align').addEventListener('click', () => {
  currentShape.align('left');
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "align",
      id: currentShape.id(),
      attrs: {
        align: "left"
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('right-align').addEventListener('click', () => {
  currentShape.align('right');
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "align",
      id: currentShape.id(),
      attrs: {
        align: "right"
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('center-align').addEventListener('click', () => {
  currentShape.align('center');
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "align",
      id: currentShape.id(),
      attrs: {
        align: "center"
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('bold-text').addEventListener('click', () => {
  let styles = currentShape.fontStyle().split(" ");
  if(styles.length === 0) currentShape.fontStyle('bold');
  else {
    let isBold=false;
    for(let i=0; i<styles.length; i++) 
      if(styles[i]==='bold') {
        isBold=true;
        styles[i]='';
      }
    if(!isBold) styles.push('bold');
    currentShape.fontStyle(styles.join(' '));
  }
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "boldenText",
      shape: "text",
      id: currentShape.id(),
      attrs: {
        fontStyle: currentShape.fontStyle()
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('italic-text').addEventListener('click', () => {
  let styles = currentShape.fontStyle().split(" ");
  if(styles.length === 0) currentShape.fontStyle('italic');
  else {
    let isItalic=false;
    for(let i=0; i<styles.length; i++) 
      if(styles[i]==='italic') {
        isItalic=true;
        styles[i]='';
      }
    if(!isItalic) styles.push('italic');
    currentShape.fontStyle(styles.join(' '));
  }
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "italiciseText",
      shape: "text",
      id: currentShape.id(),
      attrs: {
        fontStyle: currentShape.fontStyle()
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('underline-text').addEventListener('click', () => {
  let styles = currentShape.textDecoration().split(" ");
  if(styles.length === 0) currentShape.textDecoration('underline');
  else {
    let isUnderlined=false;
    for(let i=0; i<styles.length; i++) 
      if(styles[i]==='underline') {
        isUnderlined=true;
        styles[i]='';
      }
    if(!isUnderlined) styles.push('underline');
    currentShape.textDecoration(styles.join(' '));
  }
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "underlineText",
      shape: "text",
      id: currentShape.id(),
      attrs: {
        textDecoration: currentShape.textDecoration()
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});

document.getElementById('strikethrough-text').addEventListener('click', () => {
  let styles = currentShape.textDecoration().split(" ");
  if(styles.length === 0) currentShape.textDecoration('line-through');
  else {
    let isStriked=false;
    for(let i=0; i<styles.length; i++) 
      if(styles[i]==='line-through') {
        isStriked=true;
        styles[i]='';
      }
    if(!isStriked) styles.push('line-through');
    currentShape.textDecoration(styles.join(' '));
  }
  if(isRecording) {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "strikeText",
      shape: "text",
      id: currentShape.id(),
      attrs: {
        textDecoration: currentShape.textDecoration()
      }
    });
  }
  menuNode.style.display = 'none';
  layer.draw();
});


stage.on('contextmenu', function (e) {
  // prevent default behavior
  e.evt.preventDefault();
  if (e.target === stage) {
    // if we are on empty place of the stage we will do nothing
    return;
  }
  currentShape = e.target;
  if(currentShape === layerBackgroundRect) return;
  document.getElementById("row-alignment").style.display = 
      (currentShape instanceof Konva.Text)?'inline-block':'none';
  document.getElementById("row-decoration").style.display = 
      (currentShape instanceof Konva.Text)?'inline-block':'none';
  
  // show menu
  selected_transformer.nodes([currentShape]);
  let pos = stage.getPointerPosition();
  const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
  menuNode.style.display = 'initial';
  let containerRect = stage.container().getBoundingClientRect();
  if(pos.y+menuNode.clientHeight > vh) 
    menuNode.style.top = (vh-menuNode.clientHeight)+'px';
  else
  menuNode.style.top =
    containerRect.top/*window.scrollY*/ + stage.getPointerPosition().y + 4 + 'px';
  menuNode.style.left =
    containerRect.left/*window.scrollX*/ + stage.getPointerPosition().x + 4 + 'px';
  // console.log(menuNode.style.top, menuNode.style.left);
});

canvasStream =layer.getCanvas()._canvas.captureStream();

function generateBlob() {
  const json_string = JSON.stringify(recording_array, null, 2);
  const length = json_string.length;
  
  console.log(`Audio chunks length:${audioChunks.length}`);
  console.log(`First audio chunk:`, audioChunks[0]);
  if(audioblob === null) generate_audio_blob();
  console.log(audioblob);
  // let audio_string = await audioblob.text();
  // console.log(audio_string);
  const final_str = length+"\n"+json_string; 
  
  const blob = new Blob([final_str, audioblob], {type: 'text/plain'});
  const url = URL.createObjectURL(blob);
  
  const cpxbutton = document.getElementById('cpxDownload');
  cpxbutton.disabled=false;
  cpxbutton.onclick = function() {
    const link = document.createElement('a');
    link.href = url;
    link.download = "scene.cpx";
  
    document.body.appendChild(link);
    link.click();
    // cpxbutton.disabled=true;
  }

  // video download code
  const videoBlob = new Blob(recordedBlobs, {type: 'video/webm'});
  const videoUrl = window.URL.createObjectURL(videoBlob);

  const videoButton = document.getElementById('cpxDownloadVideo');
  videoButton.disabled = false;
  videoButton.onclick = function() {
    const vlink = document.createElement('a');
    vlink.href = videoUrl;
    vlink.download = "scene.webm";

    document.body.appendChild(vlink);
    vlink.click();
  }
  
}

record_button.addEventListener('click', function(e) {
  if(!hasAudioPermission) return;
  if(!isRecording) {
    isRecording = true;
    
    // video recording setup 
    let options = {mimeType: 'video/webm'};
    mediaRecorder = new MediaRecorder(canvasStream, options);
    recordedBlobs = [];
    mediaRecorder.onstop = handleVideoStop;
    mediaRecorder.ondataavailable = handleVideoDataAvailable;
    mediaRecorder.start(100);
    console.log('Media Recorder started: ', mediaRecorder);

    audioRecorder.start(1000);
    console.log(audioRecorder.state);
    last_activity_timestamp=Date.now();
    recording_array.push({
      ts:0,
      type:"start"
    });
    document.getElementById('startBtn').innerHTML = 'Stop Recording/Streaming';
    document.getElementById('status').innerHTML = `Recording`;
  } else {
    recording_array.push({
      ts: Date.now() - last_activity_timestamp,
      type: "end"
    });
    audioRecorder.requestData();
    audioRecorder.stop();
    console.log(audioRecorder.state);
    console.log(`Audio chunks size: ${audioChunks.length}`);

    // getting video recording
    mediaRecorder.stop();

    // generating cpx and video blob
    generateBlob();

    // resetting
    document.getElementById('status').innerHTML = `Idle`;
    isRecording=false;
    recording_array = [];
    idx=0;
    document.getElementById('startBtn').innerHTML = 'Stop Recording/Streaming';
    record_button.disabled=true;
  }
});