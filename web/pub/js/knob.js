// knob.js

export class Knob {
	constructor(options) {
		this._id = options.id;
		this._min = parseFloat(options.min);
		this._max = parseFloat(options.max);
		this._step = parseFloat(options.step) || 1;
		this._value = parseFloat(options.value) || this._min;
		this._unit = options.unit || '';
		this._size = options.size || 40;
		this._borderColor = options.borderColor || 'red';
		this._valueColor = options.valueColor || 'orange';
		this._resetValue = options.resetValue !== undefined ? options.resetValue : 0;
		this._sendDuringDrag = options.sendDuringDrag || false;
		this._sendInterval = options.sendInterval || 100;
		this._lastSent = 0;

		this.container = document.createElement('div');
		this.container.className = 'knob-container';
		this.container.id = `knob-${this._id}`;

		this.knob = document.createElement('div');
		this.knob.className = 'knob';

		this.valueDisplay = document.createElement('div');
		this.valueDisplay.className = 'knob-value';
		this.knob.style.borderColor = this._borderColor;
		this.valueDisplay.style.color = this._valueColor;


		this.container.appendChild(this.knob);
		this.container.appendChild(this.valueDisplay);

		this.updateDisplay();
		this.setupEventListeners();
	}

	get min() { return this._min; }
	get max() { return this._max; }
	get step() { return this._step; }
	get value() { return this._value; }
	get element() { return this.container; }
	get type() { return 'number'; }
	get valueAsNumber() { return this._value; }

	set min(val) { this._min = parseFloat(val); }
	set max(val) { this._max = parseFloat(val); }
	set step(val) { this._step = parseFloat(val); }

	set value(val) {
		const rounded = Math.round(val / this._step) * this._step;
		this._value = Math.max(this._min, Math.min(this._max, rounded));
		this.updateDisplay();
	}

	set valueAsNumber(val) {
		this.value = val;
	}

	set borderColor(color) {
		this._borderColor = color;
		this.knob.style.borderColor = color;
	}

	set valueColor(color) {
		this._valueColor = color;
		this.valueDisplay.style.color = color;
	}

	get borderColor() { return this._borderColor; }
	get valueColor() { return this._valueColor; }

	updateDisplay() {
		const angle = 45 + ((this._value - this._min) / (this._max - this._min)) * 270;
		this.knob.style.transform = `rotate(${angle}deg)`;
		this.knob.style.width = `${this._size}px`;
		this.knob.style.height = `${this._size}px`;
		this.valueDisplay.textContent = `${this._value.toFixed(1)}${this._unit ? ' ' + this._unit : ''}`;
	}

	setupEventListeners() {
		this.isDragging = false;
		this.startY = 0;
		this.startValue = 0;
		this.valueChanged = false;

		this.knob.addEventListener('mousedown', this.handleMouseDown.bind(this));
		document.addEventListener('mousemove', this.handleMouseMove.bind(this));
		document.addEventListener('mouseup', this.handleMouseUp.bind(this));
		this.knob.addEventListener('touchstart', this.handleTouchStart.bind(this));
		document.addEventListener('touchmove', this.handleTouchMove.bind(this));
		document.addEventListener('touchend', this.handleTouchEnd.bind(this));
		this.knob.addEventListener('dblclick', this.handleDoubleClick.bind(this));
	}

	handleMouseDown(e) {
		this.isDragging = true;
		this.startY = e.clientY;
		this.startValue = this._value;
		this.valueChanged = false;
		e.preventDefault();
	}

	handleMouseMove(e) {
		if (!this.isDragging) return;
		const deltaY = this.startY - e.clientY;
		this.updateValueFromDrag(deltaY);
	}

	handleMouseUp() {
		this.finalizeDrag();
	}

	handleTouchStart(e) {
		this.isDragging = true;
		this.startY = e.touches[0].clientY;
		this.startValue = this._value;
		this.valueChanged = false;
		e.preventDefault();
	}

	handleTouchMove(e) {
		if (!this.isDragging) return;
		const deltaY = this.startY - e.touches[0].clientY;
		this.updateValueFromDrag(deltaY);
	}

	handleTouchEnd() {
		this.finalizeDrag();
	}

	handleDoubleClick() {
		this.value = this._resetValue;
		this.triggerUserChange();
	}

	updateValueFromDrag(deltaY) {
		const stepFactor = 1 * this._step;
		let newValue = this.startValue + (deltaY * stepFactor);
		newValue = Math.round(newValue / this._step) * this._step;
		newValue = Math.min(this._max, Math.max(this._min, newValue));

		if (newValue !== this._value) {
			this.value = newValue;
			this.valueChanged = true;
			if (this._sendDuringDrag) {
				const now = Date.now();
				if (now - this._lastSent > this._sendInterval) {
					this.triggerUserChange();
					this._lastSent = now;
				}
			}
		}
	}

	finalizeDrag() {
		this.isDragging = false;
		if (this.valueChanged && (!this._sendDuringDrag || this._value !== this.startValue)) {
			this.triggerUserChange();
		}
	}

	updateFromOSC(value) {
		const roundedValue = Math.round(value / this._step) * this._step;
		const clippedValue = Math.min(this._max, Math.max(this._min, roundedValue));
		if (Math.abs(clippedValue - this._value) > 0.01) {
			this.value = clippedValue;
		}
	}

	triggerUserChange() {
		const event = new CustomEvent('user-change', {
			detail: {
				value: this._value,
				id: this._id
			}
		});
		this.container.dispatchEvent(event);
	}

	triggerChangeEvent() {
		this.container.dispatchEvent(new Event('change', { bubbles: true }));
	}
}
