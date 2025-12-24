
document.addEventListener('DOMContentLoaded', function() {
	fetch('help.html')
		.then(response => response.text())
		.then(html => {
			document.getElementById('help-container').innerHTML = html;
			setupHelpPopup();
			updateDynamicUrls();
			setupCopyButton();
			setupCopyButtons();
		})
		.catch(error => console.error('Fehler beim Laden des Hilfe-Popups:', error));
});

function setupHelpPopup() {
	const helpButton = document.getElementById('url-help-button');
	const helpPopup = document.getElementById('help-popup');
	const helpOverlay = document.getElementById('help-overlay');
	const closeButton = document.getElementById('close-help');
	
	if (!helpButton || !helpPopup || !helpOverlay || !closeButton) return;
	
	helpButton.addEventListener('click', function() {
		helpPopup.style.display = 'block';
		helpOverlay.style.display = 'block';
	});
	
	closeButton.addEventListener('click', function() {
		helpPopup.style.display = 'none';
		helpOverlay.style.display = 'none';
	});
	
	helpOverlay.addEventListener('click', function() {
		helpPopup.style.display = 'none';
		helpOverlay.style.display = 'none';
	});
	
	document.addEventListener('keydown', function(event) {
		if (event.key === 'Escape' && helpPopup.style.display === 'block') {
			helpPopup.style.display = 'none';
			helpOverlay.style.display = 'none';
		}
	});
}

function updateDynamicUrls() {
	const baseUrl = window.location.origin + window.location.pathname;
	
	const baseUrlElement = document.getElementById('current-base-url');
	if (baseUrlElement) {
		baseUrlElement.textContent = baseUrl;
	}
	
	// Update all URL examples
	const urlExamples = document.querySelectorAll('.dynamic-url, .url-example');
	urlExamples.forEach(element => {
		const params = element.getAttribute('data-params');
		element.textContent = `${baseUrl}?${params}`;
	});
}

function setupCopyButton() {
	const copyButton = document.getElementById('copy-url-button');
	const copyStatus = document.getElementById('copy-status');
	
	if (!copyButton || !copyStatus) return;
	
	copyButton.addEventListener('click', function() {
		const firstExample = document.querySelector('.dynamic-url');
		if (!firstExample) return;
		
		const urlToCopy = firstExample.textContent;
		
		navigator.clipboard.writeText(urlToCopy)
			.then(() => {
				copyStatus.textContent = 'Copied to clipboard!';
				setTimeout(() => {
					copyStatus.textContent = '';
				}, 2000);
			})
			.catch(err => {
				copyStatus.textContent = 'Failed to copy';
				console.error('Failed to copy URL:', err);
			});
	});
}

function setupCopyButtons() {
	const copyButtons = document.querySelectorAll('.copy-btn');
	const baseUrl = window.location.origin + window.location.pathname;
	
	copyButtons.forEach(button => {
		button.addEventListener('click', function() {
			const params = this.getAttribute('data-params');
			const urlToCopy = `${baseUrl}?${params}`;
			
			navigator.clipboard.writeText(urlToCopy)
				.then(() => {
					// Visual feedback
					const originalText = this.textContent;
					this.textContent = 'Copied!';
					this.classList.add('copied');
					
					setTimeout(() => {
						this.textContent = originalText;
						this.classList.remove('copied');
					}, 2000);
				})
				.catch(err => {
					console.error('Failed to copy URL:', err);
				});
		});
	});
}
