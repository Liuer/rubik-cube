import { 
    _decorator, Component, Node, Prefab, Camera, instantiate, 
    Vec3, tween, Quat, input, Input, EventTouch, geometry, Vec2, Mat4, Mesh, Canvas, Label,
    math,
    Tween,
    UITransform,
} from 'cc';
import { DEV } from 'cc/env';
import { Cube, CubeInfo } from './cube';
import * as momentexport from './moment.js';
const { ccclass, property } = _decorator;

const moment = momentexport.default;

interface posFaces {
    id: string
    pos: Vec3
    faces: number[]
    fId: number[]
}

interface GameInfos {
    gameTime: number
    cubeSize: number
}

interface RankInfo {
    gameTime: number
    time: number
    cubeSize: number
}

enum GameState {
    None = 0,
    Shuffle = 2,
    Gaming = 3,
    Watch = 4,
    Finish = 5,
}

const StorageKeys = {
    CubeArr: "cubeArr",
    GameInfo: "gameInfo",
    Rank: "rank",
}


@ccclass('cubeScene')
export class cubeScene extends Component {

    @property(Prefab)
    public cubePref: Prefab;

    @property(Camera)
    public carm: Camera;

    @property(Label)
    public timeLbl: Label;

    @property(Label)
    public startGameHint: Label;

    @property(Node)
    public titleNode: Node;

    @property(Node)
    public settings: Node;

    @property(Node)
    public rank: Node;

    @property(Node)
    public rankItem: Node;
    @property(Node)
    public rankContent: Node;

    private rankItems: Label[];

    @property(Node)
    public congratulation: Node;

    private vec = 1/360 * Math.PI;
    private vecDistance: number | null = null;

    private startPos: number;
    private endPos: number;
    private gap: number = Cube.Size;

    private rotateNode: Node;
    private rotateNodeChilds: Cube[] | null;
    private rubikNode: Node;

    private ray = new geometry.Ray();
    private cubeArr: Cube[];

    private selectCube: Cube = null;
    private touchStartPoint: Vec2 = null;
    private touchStartPos: Vec3 = new Vec3();
    private touchStartPos2: Vec3 = new Vec3();
    private moveDistance2 = 20;
    private planeAxisNormal: Vec3[] = [new Vec3(), new Vec3(), new Vec3()];
    private moveDir = new Vec2();

    private rotateAxis = new Vec3();
    private rotateMat4 = new Mat4();

    private tmpVec2 = new Vec2();
    private tmpVec3 = new Vec3();
    private tmpVec32 = new Vec3();
    private tmpVec33 = new Vec3();
    private tmpQuat = new Quat();
    private tmpMat4 = new Mat4();
    private tmpPlane = new geometry.Plane();

    private gameState = GameState.None;

    private tapTime: number = 0;

    //校正
    private isInCorrecting = false;
    private correctAngle = 0;
    private correctTime = -1;
    private correctTotalTime = 0;

    private gameInfos: GameInfos;

    private rankInfos: RankInfo[];

    private origColor: math.Color;

    start() {
        if(DEV){
            (window as any).cubeSene = this;
        }

        let infoStr = getStorageValue(StorageKeys.GameInfo);
        if(infoStr){
            this.gameInfos = JSON.parse(infoStr);
        } else {
            this.gameInfos = {
                gameTime: 0,
                cubeSize: 2,
            }
        }

        let rankStr = getStorageValue(StorageKeys.Rank);
        if(rankStr){
            this.rankInfos = JSON.parse(rankStr);
        } else {
            this.rankInfos = [];
        }

        this._initCube();

        let plane = new Node();
        plane.parent = this.node;

        this._setStartGameHintAnim();

        this.loadData();

        // setTimeout(()=>{
        //     console.log("check: ", this._checkIsSolved());
        // }, 1000);

    }

    _setStartGameHintAnim(){
        let startGameHint = this.startGameHint;
        if(!this.origColor){
            this.origColor = new math.Color(this.startGameHint.color);
        } else {
            Tween.stopAllByTarget(this.origColor);
            startGameHint.color = this.origColor;
        }

        let origColor = this.origColor;
        let rp = tween(origColor).to(1, { a: 0 }, {
            onUpdate(target: math.Color) {
                startGameHint.color = target;
            },
        }).delay(0.17).to(1, { a: 255 }, {
            onUpdate(target: math.Color) {
                startGameHint.color = target;
            },
        }).delay(0.2);
        tween(origColor).repeatForever(rp).start();
    }

    _setTimeLbl(gts2: number){
        let minute = Math.floor(gts2 / 60);
        let sec = Math.floor(gts2) % 60;

        this.timeLbl.string = `${formatTimeStr(minute)}:${formatTimeStr(sec)}`;
    }

    update(dt: number) {
        if(this.gameState == GameState.Gaming){
            let gts = Math.floor(this.gameInfos.gameTime);
            this.gameInfos.gameTime += dt;
            let gts2 = Math.floor(this.gameInfos.gameTime);
            if(gts !== gts2){
                this._setTimeLbl(gts2);
            }
        }

        if (this.isInCorrecting) {
            this.correctTime += dt;

            const t = Math.min(this.correctTime / this.correctTotalTime, 1);
            let angle = this.vecDistance + (this.correctAngle - this.vecDistance) * t;
            Mat4.rotate(this.tmpMat4, this.rotateMat4, angle, this.rotateAxis);

            if(this.rotateNodeChilds != null){
                this.rotateNode.matrix = this.tmpMat4;

                if (this.correctTime >= this.correctTotalTime) {
                    this.rotateNodeChilds.forEach((cube) => {
                        this._correctCubeNode(cube.node);
                    });

                    this.rotateNodeChilds = null;

                    this.correctTime = 0;
                    this.correctTotalTime = 0;
                    this.isInCorrecting = false;
                    this.vecDistance = null;

                    if(this._checkIsSolved()){
                        // console.log("恭喜你成功还原魔方");
                        this.gameState = GameState.Finish;

                        this.rankInfos.push({
                            gameTime: this.gameInfos.gameTime,
                            time: Date.now(),
                            cubeSize: this.gameInfos.cubeSize,
                        });
                        this.rankInfos.sort((a: RankInfo, b: RankInfo): number => {
                            return a.gameTime - b.gameTime;
                        });
                        localStorage.setItem(StorageKeys.Rank, JSON.stringify(this.rankInfos));

                        this.gameInfos.gameTime = 0;

                        localStorage.setItem(StorageKeys.CubeArr, "");

                        this.congratulation.active = true;
                        localStorage.setItem(StorageKeys.GameInfo, JSON.stringify(this.gameInfos));
                        return
                    }

                    this.saveData();
                }
            } else {
                this.rubikNode.parent.matrix = this.tmpMat4;

                if (this.correctTime >= this.correctTotalTime) {
                    this.correctTime = 0;
                    this.correctTotalTime = 0;
                    this.isInCorrecting = false;
                    this.vecDistance = null;
                }
            }
        }
    }

    _correctCubeNode(node: Node){
        node.getWorldPosition(this.tmpVec3);
        node.getWorldRotation(this.tmpQuat);

        node.parent = this.rubikNode;

        node.setWorldPosition(this.tmpVec3);
        node.setWorldRotation(this.tmpQuat);

        //校正
        node.getPosition(this.tmpVec3);
        node.setPosition(Math.round(this.tmpVec3.x), Math.round(this.tmpVec3.y), Math.round(this.tmpVec3.z));

        node.getRotation(this.tmpQuat);
        this.tmpQuat.getEulerAngles(this.tmpVec3);

        node.setRotationFromEuler(this._fixAngle(this.tmpVec3.x), this._fixAngle(this.tmpVec3.y), this._fixAngle(this.tmpVec3.z));
    }

    _findCubeGroup(fIdIdx: number, pos: number): Cube[]{
        let cubes: Cube[] = [];
        this.cubeArr.forEach((item)=>{
            if(item.fId[fIdIdx] == pos){
                cubes.push(item);
            }
        });

        return cubes;
    }

    _checkIsSolved() {
        let posArr = [this.startPos, this.endPos];
        let xyz = ["x", "y", "z"];

        let hasSolveOne = (cubes: Cube[])=>{
            let validFaceNames: Map<string, number> = new Map();
            for(let i = 0; i < cubes.length; i++){
                let cube = cubes[i];
                for(let j = 0; j < cube.faces.length; j++){
                    if(cube.faces[j].active){
                        let name = cube.faces[j].name;
                        let val = validFaceNames[name];
                        validFaceNames[name] = val ? val + 1 : 1;
                        
                    }
                }
            }

            let vec3HasSomePos = (a: Vec3, b: Vec3): boolean => {
                return isNearEqual(a.x, b.x) || isNearEqual(a.y, b.y) || isNearEqual(a.z, b.z);
            }

            for(let fName in validFaceNames){
                let startPos = null;
                for(let ci = 0; ci < cubes.length; ci++){
                    let face = cubes[ci].getShowFaceByName(fName);
                    if(!face){
                        continue;
                    }
                    face.getWorldPosition(this.tmpVec32);
                    this.rubikNode.inverseTransformPoint(this.tmpVec32, this.tmpVec32);
                    if(startPos == null){
                        this.tmpVec3.set(this.tmpVec32);
                        startPos = this.tmpVec3;
                    } else if(!vec3HasSomePos(this.tmpVec3, this.tmpVec32)){
                        return false;
                    }
                }
            }

            return true;
        }

        //检查 6 个面
        //+-x, +-y, +-z
        for(let idx = 0; idx < xyz.length; idx++){
            for(let i = 0; i < posArr.length; i++){
                let sPos = posArr[i];
                let cubes = this._findCubeGroup(idx, sPos);
                if(!cubes && cubes.length == 0){
                    return false;
                }
                let solveOneFace = hasSolveOne(cubes);
                if(!solveOneFace){
                    return false
                }
            }
        }

        return true;
    }

    _initCube() {
        this._clearRubikNode();
        // +x: 0, -x: 1,
        // +y: 2, -y: 3,
        // +z: 4, -z: 5,
        let x1 = 0, x2 = 1,
            y1 = 2, y2 = 3,
            z1 = 4, z2 = 5;

        let arr: posFaces[] = [];
        let num = this.gameInfos.cubeSize; //数量 num * num * num
        let gap = this.gap; //每个cube 的边长为 8 
        let start = this.startPos = -((num * gap - gap) / 2);
        let end = this.endPos = -start;
        for (let x = start; x <= end; x += gap) {
            for (let y = start; y <= end; y += gap) {
                for (let z = start; z <= end; z += gap) {
                    let item = {
                        id: `${x},${y},${z}`,
                        pos: new Vec3(x, y, z),
                        faces: [],
                        fId: [x, y, z],
                    };
                    //去掉没用的面
                    if (Math.abs(x) != end) {
                        item.faces.push(x1, x2);
                    } else {
                        item.faces.push(x > 0 ? x2 : x1);
                    }
                    if (Math.abs(y) != end) {
                        item.faces.push(y1, y2);
                    } else {
                        item.faces.push(y > 0 ? y2 : y1);
                    }
                    if (Math.abs(z) != end) {
                        item.faces.push(z1, z2);
                    } else {
                        item.faces.push(z > 0 ? z2 : z1);
                    }

                    arr.push(item);
                }
            }
        }

        let rubikParentNode = new Node();
        rubikParentNode.parent = this.node;

        let rp = tween(rubikParentNode).to(2, { position: new Vec3(0, 1.5, 0) }).delay(0.17).to(2, { position: new Vec3(0, 0, 0) }).delay(0.2);
        tween(rubikParentNode).repeatForever(rp).start();

        this.rubikNode = new Node();
        this.rubikNode.parent = rubikParentNode;

        let cubeArr: Cube[] = this.cubeArr = [];
        
        for (let i = 0; i < arr.length; i++) {
            let elm = arr[i];
            let node = instantiate(this.cubePref);
            node.parent = this.rubikNode;
            node.setPosition(elm.pos);

            let cube = node.getComponent(Cube);
            cube.cubeId = elm.id;
            cube.fId = elm.fId;
            let faces = elm.faces;
            for (let j = 0; j < faces.length; j++) {
                cube.faces[faces[j]].active = false;
            }

            cubeArr.push(cube);
        }

        let rotateNode = this.rotateNode = new Node();
        rotateNode.parent = this.rubikNode;

        // console.log("test checkIsSolved: ", this._checkIsSolved());

        if(num == 2){
            this.carm.node.setPosition(50, 50, 50);
            this.carm.node.setRotationFromEuler(0, 0, 0);
            this.carm.node.lookAt(new Vec3());
        } else if(num == 3){
            this.carm.node.setPosition(70, 70, 70);
            this.carm.node.setRotationFromEuler(0, 0, 0);
            this.carm.node.lookAt(new Vec3());
        } else if(num == 4){
            this.carm.node.setPosition(80, 80, 80);
            this.carm.node.setRotationFromEuler(0, 0, 0);
            this.carm.node.lookAt(new Vec3());
        }

    }

    testSelectCubeGroup(fIdx: number, pos:number){
        if(fIdx == -1){
            this.cubeArr.forEach((cube)=>{
                cube.node.active = true;
            });
        } else {
            let cubes = this._findCubeGroup(fIdx, pos);
            this.cubeArr.forEach((cube)=>{
                let c = cubes.find((cube2)=>{
                    return cube2 == cube;
                });
                cube.node.active = !!c;
            });
        }
        
    }

    _clearRubikNode(){
        if(!this.rubikNode){
            return;
        }

        this.rubikNode.parent.removeFromParent();
        this.rubikNode = null;
        this.rotateNode = null;
        this.cubeArr = null;
    }

    onSetCubeSize(event: TouchEvent, size: number){
        if(this.gameState == GameState.Shuffle){
            return;
        }
        this._setCubeSize(+size);
    }

    _setCubeSize(size: number){
        this.gameInfos.cubeSize = size;
        this.gameInfos.gameTime = 0;

        localStorage.setItem(StorageKeys.GameInfo, JSON.stringify(this.gameInfos));
        localStorage.setItem(StorageKeys.CubeArr, "");

        this._initCube();

        this.gameState = GameState.None;

        this.timeLbl.node.active = false;
        this.titleNode.active = true;

        this._setStartGameHintAnim();

        this.hideSetting();
    }

    onLoad() {
        this._initInput();
    }

    onDestroy() {
        this._destroyInput();
    }

    _initInput() {
        input.on(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.on(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.on(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    _destroyInput() {
        input.off(Input.EventType.TOUCH_START, this._onTouchStart, this);
        input.off(Input.EventType.TOUCH_END, this._onTouchEnd, this);
        input.off(Input.EventType.TOUCH_MOVE, this._onTouchMove, this);
    }

    _getHitCube(ray: geometry.Ray): { cube: Cube, hit: number } {
        let hitCubes: { cube: Cube, hit: number }[] = [];
        for (let i = 0; i < this.cubeArr.length; i++) {
            let cube = this.cubeArr[i];
            let num = cube.rayTest(ray);
            if (num > 0) {
                hitCubes.push({
                    cube: cube,
                    hit: num,
                });
            }
        }

        let selectCube: { cube: Cube, hit: number } = null;
        for (let i = 0; i < hitCubes.length; i++) {
            let cube = hitCubes[i];
            if (selectCube === null || selectCube.hit > cube.hit) {
                selectCube = cube;
            }
        }

        return selectCube;
    }

    _onTouchStart(event: EventTouch) {
        if (this.gameState == GameState.None) {
            let now = Date.now();
            if(this.tapTime == 0){
                this.tapTime = now;
            } else if(now - this.tapTime < 300){
                if(this.gameInfos.gameTime > 0){
                    this._justRot();
                } else {
                    this.shuffle();
                }
                
            } else {
                this.tapTime = now;
            }
        }

        if (this.gameState == GameState.Gaming || this.gameState == GameState.Watch) {
            if(this.isInCorrecting){
                return;
            }
            event.touch.getLocation(this.tmpVec2);
            this.carm.screenPointToRay(this.tmpVec2.x, this.tmpVec2.y, this.ray);

            let selectCube = this._getHitCube(this.ray);
            if (selectCube !== null) {
                this.selectCube = selectCube.cube;
                this.ray.computeHit(this.touchStartPos, selectCube.hit);

                let px = Math.abs(this.touchStartPos.x);
                let py = Math.abs(this.touchStartPos.y);
                let pz = Math.abs(this.touchStartPos.z);
                if (px > py && px > pz) { //x
                    this.planeAxisNormal[0].set(1, 0, 0);
                    this.planeAxisNormal[1].set(0, 1, 0);
                    this.planeAxisNormal[2].set(0, 0, 1);
                } else if (py > px && py > pz) { //y
                    this.planeAxisNormal[0].set(0, 1, 0);
                    this.planeAxisNormal[1].set(0, 0, 1);
                    this.planeAxisNormal[2].set(1, 0, 0);
                } else { //z
                    this.planeAxisNormal[0].set(0, 0, 1);
                    this.planeAxisNormal[1].set(1, 0, 0);
                    this.planeAxisNormal[2].set(0, 1, 0);
                }

                geometry.Plane.fromNormalAndPoint(this.tmpPlane, this.planeAxisNormal[0], this.touchStartPos);
            }
            this.touchStartPoint = new Vec2(this.tmpVec2);
        }

    }

    _onTouchEnd(event: EventTouch) {
        if(this.gameState == GameState.Gaming || this.gameState == GameState.Watch) {
            if(this.isInCorrecting){
                return;
            }
            if (
                (this.rotateNodeChilds && this.rotateNodeChilds.length > 0)
                || (this.selectCube === null && this.vecDistance !== null)
            ) {
                this.isInCorrecting = true;
    
                const round = Math.PI * 0.5;
                this.correctAngle = Math.sign(this.vecDistance) * Math.round(Math.abs(this.vecDistance) / round) * round;
                this.correctTotalTime = (Math.abs(this.vecDistance - this.correctAngle) / round) * 0.3;
                this.correctTime = 0;
            }
    
            this.touchStartPoint = null;
            this.selectCube = null;
        }
        
    }

    _onTouchMove(event: EventTouch) {
        if(this.gameState == GameState.Gaming || this.gameState == GameState.Watch) {
            this._processTouchMoveInGaming(event);
        }

    }

    _processTouchMoveInGaming(event: EventTouch){
        if(this.isInCorrecting){
            return;
        }
        event.touch.getLocation(this.tmpVec2);
        if (this.selectCube != null) {
            if(this.gameState == GameState.Watch){
                this.gameState = GameState.Gaming;
            }
            //移动一个面
            if (this.vecDistance != null) {
                this.tmpVec2.subtract(this.touchStartPoint);

                if (this.moveDir.x != 0) {
                    this.vecDistance = Math.sign(this.moveDir.x) * (this.tmpVec2.x) * this.vec;
                } else {
                    this.vecDistance = Math.sign(this.moveDir.y) * (this.tmpVec2.y) * this.vec;
                }

                Mat4.rotate(this.tmpMat4, this.rotateMat4, this.vecDistance, this.rotateAxis);
                this.rotateNode.matrix = this.tmpMat4;

            } else if (Vec2.squaredDistance(this.touchStartPoint, this.tmpVec2) >= this.moveDistance2 * this.moveDistance2) {
                this.carm.screenPointToRay(this.tmpVec2.x, this.tmpVec2.y, this.ray);

                let hNum = geometry.intersect.rayPlane(this.ray, this.tmpPlane);
                this.ray.computeHit(this.touchStartPos2, hNum);

                Vec3.subtract(this.tmpVec3, this.touchStartPos2, this.touchStartPos);
                Vec3.project(this.tmpVec32, this.tmpVec3, this.planeAxisNormal[1]);
                let len1 = this.tmpVec32.lengthSqr();
                Vec3.project(this.tmpVec33, this.tmpVec3, this.planeAxisNormal[2]);
                let len2 = this.tmpVec33.lengthSqr();

                if (len1 > len2) {
                    Vec3.normalize(this.tmpVec32, this.tmpVec32);
                    Vec3.cross(this.rotateAxis, this.planeAxisNormal[0], this.tmpVec32);

                } else {
                    Vec3.normalize(this.tmpVec33, this.tmpVec33);
                    Vec3.cross(this.rotateAxis, this.planeAxisNormal[0], this.tmpVec33);
                }

                this.tmpVec2.subtract(this.touchStartPoint);
                if (Math.abs(this.tmpVec2.x) > Math.abs(this.tmpVec2.y)) {
                    this.moveDir.x = Math.sign(this.tmpVec2.x) * 1;
                    this.moveDir.y = 0;
                } else {
                    this.moveDir.x = 0;
                    this.moveDir.y = Math.sign(this.tmpVec2.y) * 1;
                }
                
                if (this.rotateAxis.x === 0 && this.rotateAxis.y === 0 && this.rotateAxis.z === 0) {
                    console.warn("this.rotateAxis is zero");
                    return
                }
                
                let lra = new Vec3(0,0,0);
                this.rubikNode.inverseTransformPoint(this.rotateAxis, this.rotateAxis);
                this.rubikNode.inverseTransformPoint(lra, lra);
                this.rotateAxis.subtract(lra);
                Vec3.round(this.rotateAxis, this.rotateAxis);

                let sPos = this.selectCube.node.position;
                let cubes: Cube[];

                if (this.rotateAxis.x != 0) {
                    cubes = this._getRotateCubes(sPos.x, null, null);
                } else if (this.rotateAxis.y != 0) {
                    cubes = this._getRotateCubes(null, sPos.y, null);
                } else if (this.rotateAxis.z != 0) {
                    cubes = this._getRotateCubes(null, null, sPos.z);
                }

                //
                this.rotateNode.setRotationFromEuler(0, 0, 0);
                this.rotateNodeChilds = cubes;
                this.rotateNodeChilds.forEach((cube) => {
                    cube.node.parent = this.rotateNode;
                });

                if (this.moveDir.x != 0) {
                    this.vecDistance = Math.sign(this.moveDir.x) * (this.tmpVec2.x) * this.vec;
                } else {
                    this.vecDistance = Math.sign(this.moveDir.y) * (this.tmpVec2.y) * this.vec;
                }

                this.rotateMat4.fromRTS(this.rotateNode.rotation, this.rotateNode.position, this.rotateNode.scale);
                Mat4.rotate(this.tmpMat4, this.rotateMat4, this.vecDistance, this.rotateAxis);
                this.rotateNode.matrix = this.tmpMat4;
            }
        } else {
            //移动整个魔方
            if (this.vecDistance != null) {

                this.tmpVec2.subtract(this.touchStartPoint);

                if (this.moveDir.x != 0) {
                    this.vecDistance = Math.sign(this.moveDir.x) * (this.tmpVec2.x) * this.vec;
                } else {
                    this.vecDistance = Math.sign(this.moveDir.y) * (this.tmpVec2.y) * this.vec;
                }

                Mat4.rotate(this.tmpMat4, this.rotateMat4, this.vecDistance, this.rotateAxis);
                this.tmpMat4.getRotation(this.tmpQuat);
                this.rubikNode.parent.setRotation(this.tmpQuat);

            } else if (Vec2.squaredDistance(this.touchStartPoint, this.tmpVec2) >= this.moveDistance2 * this.moveDistance2) {
                let dVec = new Vec2();
                Vec2.subtract(dVec, this.tmpVec2, this.touchStartPoint);

                let width = this.carm.camera.width;

                if(Math.abs(dVec.y) < this.moveDistance2 - 2){
                    this.rotateAxis.set(0, 1, 0);
                    this.moveDir.set(1, 0);
                } else if(this.tmpVec2.x < width * 0.5){
                    this.rotateAxis.set(1, 0, 0);
                    this.moveDir.set(0, -1);
                } else {
                    this.rotateAxis.set(0, 0, 1);
                    this.moveDir.set(0, 1);
                }

                this.tmpVec2.subtract(this.touchStartPoint);

                if (this.moveDir.x != 0) {
                    this.vecDistance = Math.sign(this.moveDir.x) * (this.tmpVec2.x) * this.vec;
                } else {
                    this.vecDistance = Math.sign(this.moveDir.y) * (this.tmpVec2.y) * this.vec;
                }

                this.rubikNode.parent.inverseTransformPoint(this.rotateAxis, this.rotateAxis);
                this.rubikNode.parent.inverseTransformPoint(this.tmpVec32, Vec3.ZERO);
                this.rotateAxis.subtract(this.tmpVec32);

                this.rotateMat4.fromRTS(this.rubikNode.parent.getRotation(), Vec3.ZERO, this.rubikNode.parent.scale);
                Mat4.rotate(this.tmpMat4, this.rotateMat4, this.vecDistance, this.rotateAxis);
                this.tmpMat4.getRotation(this.tmpQuat);
                this.rubikNode.parent.setRotation(this.tmpQuat);

            }
        }
    }

    //选出需要旋转的 cube
    _getRotateCubes(x: number | null, y: number | null, z: number | null): Cube[] {
        let cubes: Cube[] = [];

        for (let i = 0; i < this.cubeArr.length; i++) {
            let c = this.cubeArr[i];
            let pos = c.node.position;
            if (x !== null && isNearEqual(pos.x, x)) {
                cubes.push(c);
            } else if (y !== null && isNearEqual(pos.y, y)) {
                cubes.push(c);
            } else if (z !== null && isNearEqual(pos.z, z)) {
                cubes.push(c);
            }
        }

        return cubes
    }

    shuffle(){
        this.gameState = GameState.Shuffle;

        this.timeLbl.string = "00:00";
        this.timeLbl.node.active = true;

        this.titleNode.active = false;

        let rad = Math.PI * 0.5;
        let rotAxis = new Vec3();
        let axies = [new Vec3(1,0,0), new Vec3(0,1,0), new Vec3(0,0,1)];
        let timeMax = axies.length * this.gameInfos.cubeSize * this.gameInfos.cubeSize;
        let time = 0;
        let rTimeTotal = 150; //单位： 毫秒
        
        let preAxis: Vec3 = null;
        let prePos: number = null;
        let preDir: number = null;
        let startRot = ()=>{
            time += 1;

            let dir = Math.random() >= 0.5 ? -1 : 1;
            let axis = axies[Math.floor(Math.random()*axies.length)];
            let rp = Math.floor(Math.random()*this.gameInfos.cubeSize);
            let pos = this.startPos + rp * this.gap;
            if(preAxis == axis && prePos == pos){
                //让2个变换之间不相同
                pos = this.startPos + ((rp + 1)%this.gameInfos.cubeSize) * this.gap;
            }
            preAxis = axis;
            prePos = pos;
            preDir = dir;
            rotAxis.set(axis).multiplyScalar(dir);
            this._rotateByAxis(rotAxis, rad, pos, rTimeTotal).then(()=>{
                if(time < timeMax){
                    startRot();
                } else {
                    this.gameState = GameState.Watch;
                }
            });
        }

        startRot();

        let rubikParentNode = this.rubikNode.parent;
        let tRot = new Vec3();
        rubikParentNode.rotation.getEulerAngles(tRot)
        tween(tRot).to(rTimeTotal* timeMax / 1000, {y: 360 * (3 + this.gameInfos.cubeSize - 2)}, {
            easing: "smooth",
            onUpdate(tar:Vec3){
                rubikParentNode.setRotationFromEuler(tar);
            }
        }).start();
    }

    _fixAngle(angle: number): number {
        angle = angle % 360;
        for (let i = -360; i <= 360; i += 90) {
            if (Math.abs(i - angle) < 45) {
                return i;
            }
        }
    }

    _rotateByAxis(axis: Vec3, rad: number, pos: number, rTimeTotal:number = 150){
        return new Promise((resolve, reject)=>{
            let cubes: Cube[];
            if(axis.x != 0){
                cubes = this._getRotateCubes(pos, null, null);
            } else if(axis.y !== 0){
                cubes = this._getRotateCubes(null, pos, null);
            } else if(axis.z !== 0){
                cubes = this._getRotateCubes(null, null, pos);
            }

            this.rotateNode.setRotationFromEuler(0, 0, 0);
            this.rotateMat4.fromRTS(this.rotateNode.rotation, this.rotateNode.position, this.rotateNode.scale);
            cubes.forEach((cube) => {
                cube.node.parent = this.rotateNode;
            });
            
            let rTime = 0;
            let delta = 1/60 * 1000;
            let update = ()=>{
                setTimeout(()=>{
                    rTime += delta;
                    const t = Math.min(rTime / rTimeTotal, 1);
                    let angle = rad * t;

                    Mat4.rotate(this.tmpMat4, this.rotateMat4, angle, axis);
                    this.rotateNode.matrix = this.tmpMat4;

                    if (rTime >= rTimeTotal) {
                        cubes.forEach((cube) => {
                            this._correctCubeNode(cube.node);
                        });
                        cubes = null;
                        resolve(0);
                    } else {
                        update();
                    }
                }, delta);
            }

            update();
        });
    }

    saveData(){
        let cubeObjArr = [];
        for(let i = 0; i < this.cubeArr.length; i++){
            cubeObjArr.push(this.cubeArr[i].toJSONObj());
        }
        localStorage.setItem(StorageKeys.CubeArr, JSON.stringify(cubeObjArr));

        localStorage.setItem(StorageKeys.GameInfo, JSON.stringify(this.gameInfos));
    }

    loadData(){
        let str = getStorageValue(StorageKeys.CubeArr);
        if(str){
            try{
                let cubeObjArr = JSON.parse(str);
                // console.log("cubeObjArr: ", cubeObjArr);
                if(cubeObjArr.length !== this.cubeArr.length){
                    throw "cubeObjArr.length !== this.cubeArr.length";
                }

                for(let i = 0; i < cubeObjArr.length; i++){
                    let obj: CubeInfo = cubeObjArr[i];
                    let cube = this.cubeArr.find((cube)=>{
                        if(cube.cubeId == obj.cubeId){
                            cube.fromJSONObj(obj);
                            return true;
                        }

                        return false;
                    });
                    if(!cube){
                        throw "cant find cube: " + obj.fId;
                    }
                }

            } catch(e){
                console.error(e);
            }
        }

        if(this.gameInfos.gameTime > 0){
            this._setTimeLbl(this.gameInfos.gameTime);
        }
    }

    onRankClick(){
        this.rank.active = true;
        this._initRank();
    }

    onSettingsClick(){
        this.settings.active = true;
    }

    hideSetting(){
        this.settings.active = false;
    }

    hideRank(){
        this.rank.active = false;
    }

    hideCongra(){
        this.congratulation.active = false;

        this.gameState = GameState.None;
    }

    _initRank(){
        if(this.rankInfos.length == 0){
            return;
       }
        if(this.rankItems && this.rankItems.length > 0){
            this.rankItems.forEach((item)=>{
                item.node.removeFromParent();
            });
            this.rankItems = [];
        }

        let height = this.rankItem.getComponent(UITransform).contentSize.height;
        let width = this.rankContent.getComponent(UITransform).contentSize.width;
        let totalHeight = height * this.rankInfos.length;
        this.rankContent.getComponent(UITransform).height = totalHeight;

        this.rankInfos.forEach((data, idx)=>{
            let node = instantiate(this.rankItem);
            let lbl = node.getComponent(Label);

            let rDate = moment(data.time);
            let minute = Math.floor(data.gameTime/60);
            let sec = Math.floor(data.gameTime)%60;
            lbl.string = `${idx+1}#  ${data.cubeSize}阶,  ${minute > 0 ? minute + "分" : ""}${sec}秒,  ${rDate.format("YYYY/MM/DD hh:mm")}`

            let parent = this.rankItem.parent;
            let y = -height * idx;
            let x = -width * 0.5 + 10;
            node.parent = parent;
            node.setPosition(x,y,0);
            node.active = true;
        });
    }

    _justRot(){
        let self = this;
        this.gameState = GameState.Shuffle;

        this.timeLbl.node.active = true;
        this.titleNode.active = false;

        let rubikParentNode = this.rubikNode.parent;
        let tRot = new Vec3();
        rubikParentNode.rotation.getEulerAngles(tRot)
        tween(tRot).to(1, {y: -360}, {
            easing: "smooth",
            onUpdate(tar:Vec3){
                rubikParentNode.setRotationFromEuler(tar);
            },
            onComplete(){
                self.gameState = GameState.Watch;
            },
        }).start();
    }

}

function getStorageValue(key: string, defaultVal: string = ""): string {
    let val = localStorage.getItem(key);
    if(!val){
        return defaultVal;
    }

    return val;
}

function isNearEqual(x: number, y: number): boolean {
    return Math.abs(x - y) <= 0.0001;
}

function formatTimeStr(x: number): string {
    return x > 9 ? x + "" : "0" + x;
}
