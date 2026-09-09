export class HistoryManager {
    constructor() {
        this.undoStack = [];
        this.redoStack = [];
        this.maxSize = 50;
        this.listeners = [];
    }

    onChange(listener) {
        this.listeners.push(listener);
    }

    _notify() {
        this.listeners.forEach(l => l({ canUndo: this.undoStack.length > 0, canRedo: this.redoStack.length > 0 }));
    }

    pushState(state) {
        // deep clone the state (annotations and imageAnnotations, and highlights)
        const clonedState = JSON.parse(JSON.stringify(state));
        this.undoStack.push(clonedState);
        if (this.undoStack.length > this.maxSize) {
            this.undoStack.shift();
        }
        this.redoStack = []; // clear redo stack on new action
        this._notify();
    }

    undo(currentState) {
        if (this.undoStack.length === 0) return null;
        
        // Push current state to redo
        this.redoStack.push(JSON.parse(JSON.stringify(currentState)));
        
        // Pop from undo
        const previousState = this.undoStack.pop();
        this._notify();
        return JSON.parse(JSON.stringify(previousState));
    }

    redo(currentState) {
        if (this.redoStack.length === 0) return null;

        // Push current state to undo
        this.undoStack.push(JSON.parse(JSON.stringify(currentState)));

        // Pop from redo
        const nextState = this.redoStack.pop();
        this._notify();
        return JSON.parse(JSON.stringify(nextState));
    }
}

export const globalHistory = new HistoryManager();
