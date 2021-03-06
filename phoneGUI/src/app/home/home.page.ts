/*
Program made specifically for Dimension 720x360
*/
import { Component, ElementRef, ViewChild, ViewEncapsulation, OnInit } from '@angular/core';

import { CanvasComponent } from '../canvas';
import { SenseComponent } from '../sense';

// import { Vibration } from '@ionic-native/vibration/ngx';
import { Serial } from '@ionic-native/serial/ngx';
import { Hotspot } from '@ionic-native/hotspot/ngx';
import { CamControlService } from '../cam-control.service';
import { Platform } from '@ionic/angular';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  encapsulation: ViewEncapsulation.None
})
export class HomePage {
    @ViewChild('canvas') canvasEl : ElementRef;
    @ViewChild('overlay') overlayEl : ElementRef;
    @ViewChild('senseLayer') senseEl : ElementRef;
    @ViewChild('mjpegstream', { read: ElementRef }) mjpegEl : ElementRef;

    canvas : CanvasComponent;
    overlay : CanvasComponent;
    sense : SenseComponent;

    flightMode = "1"; // default for the flighMode is standard (1)
    hotspot_name = "dude_cam"  // set the designated hotspot name
    hotspot_password = "akuganteng"  // set hotspot password

    // This is the actual state : please be careful before you update this
    private throttle=0;
    private rudder=0;
    private elevator=0;
    private aileron=0;
    private servo = 127;

    // private refreshObservable: Subscription;

    // keep tracking of active pointers
    private activePointersNum : number;
    private PointersRegisters = []; // this is to track active box so that it can also track until outside of boundary

    private readSerialResult = []; // Array the result of reading the serial

    private intervalSerial = undefined;

    // // This is the Object that will be rendered as GUI - remember it is only background
    // canvasData = [ // all the objects to be generated !important
    //   [0,134,242,161], // left controller
    //   [0,591,242,161] // right controller
    // ];

    // in percentage
    canvasData = [
        [0, 18.6, 67.2, 44.72], // width is with respect to phone's height
        [0, 91, 67.2, 44.72]
    ];

    servoControlBack = [1,60,70,30,100]; // 1, x center, y center, width, height // this is real pixel

    serial_config = {
      baudRate: 19200,
      dataBits: 8,
      stopBits: 1,
      parity: 0,
      dtr: true,
      rts: true,
      sleepOnPause: false
    };
    private serial_permission:boolean; // whether or not its already requested
    // private readSerialObservable:Subscription;

    img_src: string;
    root_dir: string;
    button_rec_name = "REC"
    constructor(private serial: Serial, private hotspot: Hotspot, public camControl: CamControlService, public plt: Platform) {
      // this.refreshObservable = Observable.interval(250).subscribe(()=>{
      //   //function of canvas refresh for every 250ms
      // });
      this.serial_permission = false;
      this.hotspot.createHotspot(this.hotspot_name,"WPA_PSK",this.hotspot_password).then(()=>{
        this.hotspot.getAllHotspotDevices().then((dev)=>{
          if (!(dev === undefined || dev.length == 0)) {
            this.root_dir = "http://"+dev[0].ip+":8000/";
            this.img_src = this.root_dir+"stream.mjpg";
            //console.log(this.img_src)
          }else{
            this.img_src = "";
          }
        })
      })
    }

    toggleRec() {
      this.camControl.toggleRec(this.root_dir).then((x) => {
        if(!x) {
          this.button_rec_name = "REC";
        }else{
          this.button_rec_name = "STOP";
        }
      })
    }

    ngOnInit() {
        if (this.plt.isLandscape()) {
            this.canvasData[1][1] = 88;
        }
      this.canvas = new CanvasComponent(this.canvasEl);
      this.overlay = new CanvasComponent(this.overlayEl);
      this.sense = new SenseComponent(this.senseEl);
      var mjpegstream = this.mjpegEl.nativeElement
      // console.log(this.sense.checkDistance([1.1,1],[0,0,0,2]));

      // this will refresh the mjpegEl every timeout
      var TIMEOUT = 500;
      
      var self = this;
      var refreshInterval = setInterval(function() {
        self.hotspot.getAllHotspotDevices().then((dev)=>{
          if (!(dev === undefined || dev.length == 0)) {
            self.root_dir = "http://"+dev[0].ip+":8000/";
            self.img_src = self.root_dir+"stream.mjpg";
          }else{
            self.img_src = "";
          }
        })
        var img = new Image();
        img.src = self.img_src;
        img.onload = () => {mjpegstream.src = self.img_src}
        img.onstalled = () => {mjpegstream.src = ""}
        img.onerror = () => {mjpegstream.src = ""}
        img.onsuspend = () => {mjpegstream.src = ""}
        img.onabort = () => {mjpegstream.src = ""}
      }, TIMEOUT); 

      for(let i=0;i<this.canvasData.length;i++) {
        this.canvas.generateCanvasfromArray(this.canvasData[i], this.plt);
      }
      this.canvas.drawRect(this.servoControlBack[1],this.servoControlBack[2],this.servoControlBack[3],this.servoControlBack[4]);

      this.updateCanvas();
    }
    openSerialConnection_permission() { // Opening Serial Connection with permission
      this.serial.requestPermission().then(() => {
        this.serial.open(this.serial_config).then((succ) => {
          this.serial_permission=true;
          if (this.intervalSerial != undefined) {
            clearInterval(this.intervalSerial);
            this.intervalSerial = undefined;
          }
        });
        }).catch((error: any) => {
          this.overlay.drawText(415,300,"Lost connection");
          // this.readSerialObservable.unsubscribe();
          if (this.intervalSerial == undefined) this.intervalSerial = setInterval(() => this.openSerialConnection_permission(), 1000)
        });
    }
    ngOnDestroy() {
      this.serial.close();
    }
    handleStart(ev){
      this.activePointersNum = ev.touches.length;
      this.sense.clearCanvas(); // clear sense layer everytime there is an incoming detection
      for(let i=0;i<ev.touches.length;i++) {
        this.sense.drawIndicator([ev.touches[i].clientX,ev.touches[i].clientY]); // draw green indicator
      }
    }

    handleMove(ev){
      this.activePointersNum = ev.touches.length;
      this.sense.clearCanvas();
      var index, tempPointerRegs = [];
      for(let i=0;i<ev.touches.length;i++) {
        var tempX = ev.touches[i].clientX;
        var tempY = ev.touches[i].clientY;

        index = this.handlingUpdateControlStatus(tempX, tempY) ;
        if (index!=null) tempPointerRegs.push(index);
        this.sense.drawIndicator([ev.touches[i].clientX,ev.touches[i].clientY]);
      }
      this.PointersRegisters = tempPointerRegs;
      this.updateCanvas();
    }

   // this is handling of selection, only this need to be change out of anything most of the time
    handlingUpdateControlStatus(tempX, tempY) { // this will update all the control status based on cursor position
      if (this.sense.checkDistance([tempX, tempY], this.servoControlBack)) {
        this.servo = 127 - (tempY-this.servoControlBack[2])*255/this.servoControlBack[4];
        this.servo = Math.max(this.servo,0);
        this.servo = Math.min(this.servo,255);
        return null;
      }
      var index_of_active = this.sense.checkAllDistance([tempX,tempY],this.canvasData);
      // check continuity even from outside (input: [tempX,tempY], activeFoo(is to grab the this.canvasData), middle: checkAllEucledian, output: to which canvasData it belongs, and new tempX and tempY)

      // index_of_active is finding to which index of canvasData the tempX belong
      // Now its time for controller function, ow yeah
      // console.log(this.PointersRegisters);
      if (index_of_active==null) {
        [tempX, tempY, index_of_active] = this.sense.eucledianMaxPoint([tempX,tempY], this.PointersRegisters, this.canvasData) // this is to find the inside points regarding to outside pointer movement
      }

      if (index_of_active!=null) {
        var tempObj = this.canvasData[index_of_active];

        if (index_of_active==0) {
          this.throttle = -(tempY-(tempObj[2]+tempObj[3]/2));
          this.rudder = tempX-(tempObj[1]);
          this.throttle = this.throttle/tempObj[3]*100 // convert to 0-100 percentage
          this.rudder = this.rudder/tempObj[3]*100 // convert to 0-100 percentage
        }else if (index_of_active==1) {
          this.elevator = -(tempY-(tempObj[2]));
          this.aileron = tempX-(tempObj[1]);
          this.elevator = this.elevator/tempObj[3]*100 // convert to 0-100 percentage
          this.aileron = this.aileron/tempObj[3]*100 // convert to 0-100 percentage
        }
      }
      // console.log(index_of_active);
      return index_of_active;
    }

    flighModeupdated = true;// to check if flighMode is updated or not
    changeFlightMode(flightMode) {
        let ins = 0
        switch (flightMode) {
            case '1':
            ins = 1000;
            break;
            case '2':
            ins = 1295;
            break;
            case '3':
            ins = 1425;
            break;
            case '4':
            ins = 1556;
            break;
            case '5':
            ins = 1686;
            break;
            case '6':
            ins = 1915;
            break;
            default:
            ins = 1000;
        }
        ins = Math.floor((ins-1000)/1000*255); // convert to 255 //f will be for Flight Modes
        let ins_str = ins.toString() + "f"
        this.serial.write(ins_str).then(() => {
          // this.overlay.drawText(350,240,"flightMode updated("+flightMode+")"); 
          this.flighModeupdated=true;
        }).catch(()=>{this.flighModeupdated=false;});
    }

    updateCanvas() {// using global values
      let ins = Math.floor(this.throttle/100*255)+"a"+Math.floor(255-(this.rudder+50)/100*255)+"b"+Math.floor(255-(this.elevator+50)/100*255)+"c"+Math.floor((this.aileron+50)/100*255)+"d";
      ins += (255 - Math.floor(this.servo))+"e";

      this.serial.write(ins).then((succMsg) => this.overlay.drawText(415,300,succMsg)).catch((err) => {
        this.openSerialConnection_permission();
      });

      if (this.flighModeupdated==false) this.changeFlightMode(this.flightMode); // reupdate flighMode in case it is not yet updated
      this.overlay.clearCanvas();

      // Control circles
      this.overlay.drawCircle((this.rudder*this.canvasData[0][3]/100+this.canvasData[0][1]),(this.canvasData[0][2]-this.throttle*this.canvasData[0][3]/100+this.canvasData[0][3]/2),50);
      this.overlay.drawCircle((this.aileron*this.canvasData[1][3]/100+this.canvasData[1][1]),(-this.elevator*this.canvasData[1][3]/100+this.canvasData[1][2]),50);
      // Control circle for servo
      this.overlay.drawCircle(this.servoControlBack[1],(127-this.servo)/255*this.servoControlBack[4]+this.servoControlBack[2],20, 'white');

      // this.overlay.drawText(500,100,ins);
    }

    handleEnd(ev) {
      //calculation to make controller go back
      this.rudder = 0;
      this.aileron = 0;
      this.elevator = 0;
      var index, tempPointerRegs = [];
      for(let i=0;i<ev.touches.length;i++) {
        // console.log(ev.touches[i].clientX, ev.touches[i].clientY);
        index = this.handlingUpdateControlStatus(ev.touches[i].clientX, ev.touches[i].clientY) ;
        if (index!=null) tempPointerRegs.push(index);
      }
      this.PointersRegisters = tempPointerRegs;
      if (ev.touches.length==0) {
        this.rudder = 0;
        this.aileron = 0;
        this.elevator = 0;
        this.sense.clearCanvas();
        this.updateCanvas();
      }
    }
}
