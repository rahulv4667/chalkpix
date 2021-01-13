
const player_div = document.getElementById('player');
let audioPlayer = null;
let player_array = new Array();
let start_time = 0;
let elapsed_time = 0;
let isPlaying = false;
let to_be_chalked=null;
let timer_timeout = null;
let idx = 0;
let viewingmode = 'Archive';
let streamid = '';
let streamDataConnection = null;
let streamMediaConnection = null;

const stream_radio = document.getElementById('Stream');
const archive_radio = document.getElementById('Archive');

stream_radio.addEventListener('change', function() {

    if(stream_radio.checked) {
        viewingmode = 'Stream';
        player_div.childNodes=[];
        player_div.children=[];
        const chldrn = player_div.children;
        for(let chld of chldrn){
            player_div.removeChild(chld);
        }
        player_div.appendChild(
            document.getElementById('streamplayer').content.cloneNode(true));
    }
    start_time = 0;
    elapsed_time = 0;
    isPlaying=false;
    to_be_chalked=null;
    player_array=[];
    idx=0;
    streamMediaConnection = null;
    streamDataConnection = null;
    document.getElementById('status').innerHTML = 'Idle';

    document.getElementById('streamidsubmit').onclick = streamer;
});


archive_radio.addEventListener('change', function() {
    if(archive_radio.checked) {
        viewingmode = 'Archive';
        player_div.childNodes=[];
        player_div.children=[];
        const chldrn = player_div.children;
        for(let chld of chldrn){
            player_div.removeChild(chld);
        }
        player_div.appendChild(
            document.getElementById('archivalplayer').content.cloneNode(true));
    }

    start_time = 0;
    elapsed_time = 0;
    isPlaying=false;
    to_be_chalked=null;
    player_array=[];
    idx=0;
    streamMediaConnection = null;
    streamDataConnection = null;
    document.getElementById('status').innerHTML = 'Idle';

    const playerBtn = document.getElementById('playerBtn');
    audioPlayer = document.getElementById('audioPlayer');

    playerBtn.addEventListener('click', function() {
        console.log('plyer button clicked');
        if(!isPlaying) {
            if(player_array.length < 1) return;
            console.log('starting to play');
            document.getElementById('status').innerHTML = 'Playing';
            isPlaying=true;
            playerBtn.innerHTML = `<i class="fas fa-pause"></i>`;
            audioPlayer.play();
            play_chalk();
            timer();
        } else {
            document.getElementById('status').innerHTML = 'Paused';
            elapsed_time = Date.now() - start_time;
            clearTimeout(chalkout);
            if(to_be_chalked !== null) {
                clearTimeout(to_be_chalked);
                to_be_chalked=null;
            }
            // console.log(`Paused at idx: ${idx}`);
            audioPlayer.pause();
            isPlaying=false;
            playerBtn.innerHTML = `<i class="fas fa-play"></i>`;
        }
    });
});

stream_radio.click();
archive_radio.click();

let stage = new Konva.Stage({
    container: 'container',
    width : 1080,
    height : 576
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
stage.add(layer);
// layer.draw();

function loadfile(input) {
    let file = input.files[0];
    console.log(file);
    let reader = new FileReader();
    reader.readAsText(file);

    reader.onloadend = function() {
        const length = parseInt(reader.result.substr(0, reader.result.indexOf("\n")));
        const json_plus_audio = reader.result.substr(reader.result.indexOf("\n")+1);

        const json = json_plus_audio.substr(0, length);
        const audioblob = file.slice(length + length.toString().length + 1);
        
        const audioUrl = window.URL.createObjectURL(audioblob);
        console.log(audioUrl);
        audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = null;
        
        audioPlayer.srcObject = null;
        audioPlayer.src = audioUrl;

        // const link = document.createElement('a');
        // link.href = audioUrl;
        // link.download = "sceneaudio.webm";
  
        // document.body.appendChild(link);
        // link.click();

        player_array = JSON.parse(json);
        player_array.sort((a, b) => {
            if(parseInt(a.ts) < parseInt(b.ts)) return -1;
            else if(parseInt(a.ts) > parseInt(b.ts)) return 1;
            return 0;
        });

        // console.log(player_array);
    }
    reader.onerror = function (err) { 
        console.error(`Error occured while reading ${file.name}`, err); 
    }
    
}

function rgbaToHex (rgba) {
    var inParts = rgba.substring(rgba.indexOf("(")).split(","),
        r = parseInt((inParts[0].substring(1)).trim(), 10),
        g = parseInt((inParts[1]).trim(), 10),
        b = parseInt((inParts[2]).trim(), 10),
        a = parseFloat((inParts[3].substring(0, inParts[3].length - 1)).trim()).toFixed(2);
    var outParts = [
      r.toString(16),
      g.toString(16),
      b.toString(16),
      Math.round(a * 255).toString(16).substring(0, 2)
    ];
  
    // Pad single-digit output values
    outParts.forEach(function (part, i) {
      if (part.length === 1) {
        outParts[i] = '0' + part;
      }
    })
  
    return ('#' + outParts.join(''));
  }

function create_node(node_info) { 
    let node = null;
    switch(node_info.shape) {
        case "rectangle" : node = new Konva.Rect(node_info.attrs); break;
        case "circle" : node = new Konva.Circle(node_info.attrs); break;
        case "text" : node = new Konva.Text(node_info.attrs); break;
        case "brush": node = new Konva.Line(node_info.attrs); break;
        case "laser" : node = stage.findOne('#laser');
                        if(node===null||node===undefined) 
                            node = new Konva.Circle(node_info.attrs); 
                        break;
        default: return null;
    }
    layer.add(node);
}

function destroy_node(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node === null || node === undefined) return;
    node.destroy();
}

function change_node(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node===null || node===undefined) return;
    node.setAttrs(node_info.attrs);
}

function move_node(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node===null || node===undefined) return;
    switch(node_info.type) {
        case "moveUp": node.moveUp(); break;
        case "moveDown": node.moveDown(); break;
        case "moveToTop": node.moveToTop(); break;
        case "moveToBottom": node.moveToBottom(); break;
    }
}

function append_to_brush(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node===null || node === undefined) return;
    let newPoints =  node.points().concat([node_info.attrs.x, node_info.attrs.y]);
    node.points(newPoints);
}

// function alter_text(node_info) {
//     let node = stage.findOne(`#${node_info.id}`);
//     if(node === null || node === undefined) return;
    
// }

function fill_node(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node===null || node === undefined) return;
    // console.log(rgbaToHex(node_info.attrs.fill), 'fill');
    node.fill(rgbaToHex(node_info.attrs.fill));
}

function stroke_node(node_info) {
    let node = stage.findOne(`#${node_info.id}`);
    if(node===null || node === undefined) return;
    // console.log(rgbaToHex(node_info.attrs.stroke), 'stroke');
    node.stroke(rgbaToHex(node_info.attrs.stroke));
}

function chalkout() {
    // console.log(`Chalking ${idx}`);
    switch(player_array[idx].type) {
        case "create": create_node(player_array[idx]);
                        break;
        case "destroy": destroy_node(player_array[idx]);
                        break;
        case "start": break;
        case "end": break;
        case "dragstart":
        case "dragmove":
        case "dragend":
        case "mousemove":
        case "transform":
        case "keydown":
        case "boldenText":
        case "italiciseText":
        case "underlineText":
        case "strikeText":
        case "align":
             change_node(player_array[idx]);
             break;
        case "fillColor": fill_node(player_array[idx]); break;
        case "strokeColor": stroke_node(player_array[idx]); break;
        case "align": break;
        case "moveUp":
        case "moveDown":
        case "moveToTop":
        case "moveToBottom":
            move_node(player_array[idx]);
            break;
        case "append":
            // console.log(`append case`);
            append_to_brush(player_array[idx]);
            break;

    }
    layer.batchDraw();
    idx++;
    if(idx === player_array.length) {
        document.getElementById('status').innerHTML = 'Play complete';
        playerBtn.innerHTML = `<i class="fas fa-play"></i>`;
        idx = 0;
        start_time = 0;
        elapsed_time = 0;
        isPlaying = false;
        return;
    }
    if(Date.now()-start_time > parseInt(player_array[idx].ts))
        chalkout(idx);
    else to_be_chalked = setTimeout(chalkout, 
        player_array[idx].ts - player_array[idx-1].ts, idx);
    
}

function play_chalk() {
    if(player_array.length === 0) return;
    start_time=Date.now()-elapsed_time;
    chalkout();
}

function timer() {
    if(isPlaying) {
        let elapsed_ms = Date.now() - start_time;
        let elapsed_sec = elapsed_ms/1000;
        let elapsed_mins = Math.floor(elapsed_sec/60);
        elapsed_sec = Math.floor(elapsed_sec%60);
        document.getElementById('timer').innerHTML = 
                `${elapsed_mins} : ${elapsed_sec}`
        timer_timeout = setTimeout(timer, 1000);
    } else {
        clearTimeout(timer_timeout);
        timer_timeout=null;
    }
}

function chalkstream() {

    switch(player_array[idx].type) {
        case "create": create_node(player_array[idx]);
                        break;
        case "destroy": destroy_node(player_array[idx]);
                        break;
        case "start": break;
        case "end": break;
        case "dragstart":
        case "dragmove":
        case "dragend":
        case "mousemove":
        case "transform":
        case "keydown":
        case "boldenText":
        case "italiciseText":
        case "underlineText":
        case "strikeText":
        case "align":
             change_node(player_array[idx]);
             break;
        case "fillColor": fill_node(player_array[idx]); break;
        case "strokeColor": stroke_node(player_array[idx]); break;
        case "align": break;
        case "moveUp":
        case "moveDown":
        case "moveToTop":
        case "moveToBottom":
            move_node(player_array[idx]);
            break;
        case "append":
            // console.log(`append case`);
            append_to_brush(player_array[idx]);
            break;

    }
    layer.batchDraw();
    idx++;

    if(idx === player_array.length) {
        // document.getElementById('status').innerHTML = 'Play complete';
        // playerBtn.innerHTML = `<i class="fas fa-play"></i>`;
        // idx = 0;
        // start_time = 0;
        // elapsed_time = 0;
        return;
    }
    if(Date.now()-start_time > parseInt(player_array[idx].ts))
        chalkstream(idx);
    else to_be_chalked = setTimeout(chalkstream, 
        player_array[idx].ts - player_array[idx-1].ts, idx);

}



function streamer() {
    streamid = document.getElementById('streamid').value.trim();
    if(streamid === '') return;
    let peer = new Peer();
    // console.log(peer);
    let audioStream = new MediaStream();
    if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({audio: true, video: false})
        .then(function(stream) {
            audioStream = stream;
            hasAudioPermission=true;
        })
        .catch(function(err) {
            console.error(`Error while trying to fetch microphone access: `, err);
        });
    } else {
        console.error(`getUserMedia not supported in your browser`);
    }

    audioPlayer = document.getElementById('audioPlayer');

    peer.on('error', function(err) {
        console.error(`PeerJS object creation error:`, err);
    });

    peer.on('open', function(id) {
        console.log(id);

        let conn = peer.connect(streamid, {
            serialization : 'json',
            reliable: true
        });

        
        let call = peer.call(streamid, audioStream);

        conn.on('open', function() {
            idx = 0;
            document.getElementById('status').innerHTML = `Streaming`;
            console.log(`Tried open connection with ${conn.peer}`);

            conn.on('data', function(data) {
                try {
                    data.sort((a, b) => {
                        if(parseInt(a.ts) < parseInt(b.ts)) return -1;
                        else if(parseInt(a.ts) > parseInt(b.ts)) return 1;
                        return 0;
                    });
                    player_array = player_array.concat(data);
                    // console.log(data);
                    // console.log(`Player array:`, player_array);
                    start_time = Date.now() - player_array[player_array.length-1].ts;
                    chalkstream();
                }catch(err) {
                    console.error(`Error occured while parsing data:`, err);
                }
                
            });
        });

        conn.on('error', function(err) {
            console.error(`Error while connecting to peer:`, err);
        });

        // call.on('open', function() {
            // console.log('call successsful with ', call.peer);
            call.on('stream', function(stream) {
                console.log(`Streaming started:`, stream);
                audioPlayer.srcObject = stream;
                document.getElementById('audioPlayer').oncanplay = function() {
                    document.getElementById('audioPlayer').play();
                }
                audioPlayer.src = null;
            });
        // });
        
        call.on('error', function(err) {
            console.log(`Error while making audio call:`, err);
            audioPlayer.srcObject = null;
        });

    });
}