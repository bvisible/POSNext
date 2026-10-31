//// Neoffice — added file (no upstream equivalent). How far a pointer may move and still be a tap, on the floor plan
//// (NeoRestau lot 1, task 26, fix round 1): the press on a table (useTablePress) and the pan of the plan
//// (useCanvasGestures) share it, so that a finger that shakes opens its table and pans nothing, and a finger that moves
//// further pans the plan and opens nothing. 8 px, the slop browsers give a tap.
export const SLOP_PX = 8
