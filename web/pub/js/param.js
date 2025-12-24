
function getUrlParams() {
	const params = new URLSearchParams(window.location.search);
	return {
		midi: params.has('midi'),
		midiInput: cleanParamValue(params.get('midi-input')),
		midiOutput: cleanParamValue(params.get('midi-output')),
		autoConnect: params.get('auto-connect') === 'true',
		theme: params.get('theme')
	};
}

function cleanParamValue(value) {
	if (!value) return value;
	return value.replace(/^["']+|["']+$/g, '');
}

function setSelectByText(selectElement, textValue) {
	if (!selectElement || !textValue) return false;
	
	const normalize = str => str.toLowerCase().trim().replace(/\s+/g, ' ');
	const targetValue = normalize(textValue);
	
	for (let i = 0; i < selectElement.options.length; i++) {
		const optionText = normalize(selectElement.options[i].text);
		if (optionText === targetValue) {
			selectElement.selectedIndex = i;
			return true;
		}
	}
	
	console.warn(`Device not found: "${textValue}"`);
	return false;
}

function configureFromUrl() {
	try {
		const { midi, midiInput, midiOutput, autoConnect, theme } = getUrlParams();
		
		if (theme) {
			const themeSelect = document.getElementById('ui-style-select');
			if (themeSelect) {
				for (let option of themeSelect.options) {
					if (option.value === theme) {
						themeSelect.value = theme;
						break;
					}
				}
			}
		}
		
		if (!midi && !midiInput && !midiOutput) return;
		
		const typeSelect = document.getElementById('connection-type');
		if (typeSelect && midi) {
			typeSelect.value = 'MIDI';
			
			const event = new Event('change');
			typeSelect.dispatchEvent(event);
		}
		
		const checkInterval = setInterval(() => {
			const inputSelect = document.getElementById('connection-midi-input');
			const outputSelect = document.getElementById('connection-midi-output');
			
			if (!inputSelect || !outputSelect) return;
			
			let devicesSet = false;
			if (midiInput) devicesSet |= setSelectByText(inputSelect, midiInput);
			if (midiOutput) devicesSet |= setSelectByText(outputSelect, midiOutput);
			
			if (autoConnect && (devicesSet || (!midiInput && !midiOutput))) {
				const connectBtn = document.getElementById('connection-connect');
				if (connectBtn) {
					setTimeout(() => connectBtn.click(), 500);
				}
			}
			
			clearInterval(checkInterval);
		}, 300);
	} catch (error) {
		console.error("Error in URL config:", error);
	}
}

window.addEventListener('DOMContentLoaded', configureFromUrl);
