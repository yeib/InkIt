export class HistoryManager {
    constructor() {
        this.history = [];
        this.currentIndex = -1;
        this.savedIndex = -1;
        this.maxSize = 10;
        this.listeners = [];
        // Flag to block commitAction() while an undo/redo is in progress
        this.isRestoring = false;
    }

    onChange(listener) {
        this.listeners.push(listener);
    }

    _notify() {
        this.listeners.forEach(l => l({ canUndo: this.currentIndex > 0, canRedo: this.currentIndex < this.history.length - 1 }));
    }

    _updateDirty() {
        import("./state.js").then(m => {
            m.setDirty(this.currentIndex !== this.savedIndex);
        });
    }

    markSaved() {
        this.savedIndex = this.currentIndex;
        this._updateDirty();
    }

    pushState(state) {
        // Block any commit triggered by blur events during undo/redo
        if (this.isRestoring) return;

        const snapshot = JSON.parse(JSON.stringify(state));

        // Ensure we always have the initial clean baseline at index 0
        if (this.history.length === 0 || this.currentIndex === -1) {
            this.history = [{
                annotations: [],
                imageAnnotations: [],
                highlightAnnotations: []
            }];
            this.currentIndex = 0;
            this.savedIndex = 0;
        }

        if (JSON.stringify(this.history[this.currentIndex]) === JSON.stringify(snapshot)) return;

        if (this.currentIndex < this.history.length - 1) {
            this.history = this.history.slice(0, this.currentIndex + 1);
        }
        this.history.push(snapshot);
        if (this.history.length > this.maxSize) {
            this.history.shift();
            this.savedIndex--;
        } else {
            this.currentIndex++;
        }
        this._notify();
        this._updateDirty();
    }

    clear(initialState) {
        this.history = initialState ? [JSON.parse(JSON.stringify(initialState))] : [];
        this.currentIndex = initialState ? 0 : -1;
        this.savedIndex = initialState ? 0 : -1;
        this.isRestoring = false;
        this._notify();
        this._updateDirty();
    }

    undo() {
        if (this.currentIndex > 0) {
            this.currentIndex--;
            this._notify();
            this._updateDirty();
            return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        }
        return null;
    }

    redo() {
        if (this.currentIndex < this.history.length - 1) {
            this.currentIndex++;
            this._notify();
            this._updateDirty();
            return JSON.parse(JSON.stringify(this.history[this.currentIndex]));
        }
        return null;
    }

    jumpTo(index) {
        if (!Number.isInteger(index) || index < 0 || index >= this.history.length || index === this.currentIndex) {
            return null;
        }

        this.currentIndex = index;
        this._notify();
        this._updateDirty();
        return JSON.parse(JSON.stringify(this.history[index]));
    }
}

export const globalHistory = new HistoryManager();
