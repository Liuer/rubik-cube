import { _decorator, Component, Node, geometry, RenderComponent, MeshRenderer } from 'cc';
const { ccclass, property } = _decorator;

export interface CubeInfo {
    cubeId: string,
    fId: number[],
    pos: number[],
    rot: number[],
    scale: number[],
}

@ccclass('Cube')
export class Cube extends Component {
    static Size: number = 8;

    @property([Node])
    public faces: Node[];

    @property(Node)
    public body: Node;

    public cubeId: string;
    public fId: number[];

    start() {

    }

    update(deltaTime: number) {
        
    }

    rayTest(ray: geometry.Ray) {
        let mr = this.body.getComponent(MeshRenderer);
        
        let num = geometry.intersect.rayAABB(ray, mr.model.worldBounds);
        // console.log("rayTest: ", this.fId, num);

        return num;
    }

    toJSONObj(): CubeInfo {
        return {
            fId: this.fId,
            cubeId: this.cubeId,
            pos: [this.node.position.x, this.node.position.y, this.node.position.z],
            rot: [this.node.rotation.x, this.node.rotation.y, this.node.rotation.z, this.node.rotation.w],
            scale: [this.node.scale.x, this.node.scale.y, this.node.scale.z],
        };
    }

    fromJSONObj(obj: CubeInfo) {
        this.node.setPosition(obj.pos[0],obj.pos[1],obj.pos[2]);
        this.node.setRotation(obj.rot[0],obj.rot[1],obj.rot[2],obj.rot[3]);
        this.node.setScale(obj.scale[0],obj.scale[1],obj.scale[2]);
    }

    getShowFaceByName(name: string): Node{
        for(let i = 0; i < this.faces.length; i++){
            if(this.faces[i].name == name){
                if(!this.faces[i].active){
                    return null;
                }
                return this.faces[i];
            }
        }

        return null;
    }
}

