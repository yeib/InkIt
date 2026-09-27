export class HistoryManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.maxSize = 50;
        this.listeners = [];
    }

    onChange(listener) {
        this.listeners.push(listener);
    }

    _notify() {
        this.listeners.forEach(l => l({ canUndo: this.currentIndex > 0, canRedo: this.currentIndex < this.history.length - 1 }));
    }

    pushState(state) {
        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        this.history.push(JSON.parse(JSON.stringify(state)));
        if (this.history.length > this.maxSize) {
            this.history.shift();
        } else {
            this.currentIndex++;
        }
        this._notify();
        import("./state.js").then(m => {
            if (this.currentIndex <= 0) {
                m.setDirty(false);
            } else {
                m.setDirty(true);
            }
        });
    }

    clear(initialState) {
        this.history = initialState ? [JSON.parse(JSON.stringify(initialState))] : [];
        this.currentIndex = initialState ? 0 : -1;
        this._notify();
        import("./state.js").then(m => {
            if (this.currentIndex <= 0) {
                m.setDirty(false);
            } else {
                m.setDirty(true);
            }
        });
    }

    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this._notify();
        import("./state.js").then(m => {
            if (this.currentIndex <= 0) {
                m.setDirty(false);
            } else {
                m.setDirty(true);
            }
        });
            return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        }
        return null;
    }

    redo() {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            this._notify();
        import("./state.js").then(m => {
            if (this.currentIndex <= 0) {
                m.setDirty(false);
            } else {
                m.setDirty(true);
            }
        });
            return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        }
        return null;
    }
}

export const globalHistory = new HistoryManager();
