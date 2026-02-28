(async function automateResolutionTicket() {
    // Cleanup old log box if you run the script multiple times
    const existingLog = document.getElementById('fw-auto-log');
    if (existingLog) existingLog.remove();

    // Create a floating Status Box on the screen
    const uiLog = document.createElement('div');
    uiLog.id = 'fw-auto-log';
    uiLog.innerHTML = '<b style="color:white;font-size:14px;">🤖 Resolution Automation Status:</b><br><hr style="border-color:#444;margin:8px 0;">';
    uiLog.style.cssText = 'position:fixed;top:20px;right:20px;background:#183247;color:#00FF00;padding:15px;z-index:2147483647;font-family:monospace;border-radius:8px;box-shadow:0 10px 25px rgba(0,0,0,0.5);width:320px;font-size:13px;line-height:1.6;pointer-events:none;';
    document.body.appendChild(uiLog);

    function log(msg) {
        console.log(msg.replace(/<[^>]*>?/gm, ''));
        uiLog.innerHTML += `<div style="margin-bottom:4px;">${msg}</div>`;
    }

    const delay = ms => new Promise(res => setTimeout(res, ms));
    const cleanStr = str => str.replace(/\s+/g, ' ').trim().toLowerCase();

    function simulateClick(element) {
        element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window }));
        element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window }));
    }

    // Helper: Set Ember Dropdown Value
    async function setDropdownValue(fieldName, optionText) {
        log(`<span style="color:#6aa8ff">➡️ ${fieldName}</span>`);

        let trigger = null;
        let fieldContainer = null;

        // Wait up to 5 seconds for the field to render on the page (handles slow networks / ticket switching)
        for (let i = 0; i < 10; i++) {
            fieldContainer = document.querySelector(`[data-test-id="tkt-properties-${fieldName}"]`) ||
                document.querySelector(`[data-test-id="${fieldName}"]`);

            if (fieldContainer) trigger = fieldContainer.querySelector('.ember-power-select-trigger');

            if (!trigger) {
                const labels = Array.from(document.querySelectorAll('label, .ember-power-select-placeholder'));
                const lbl = labels.find(l => cleanStr(l.getAttribute('title') || '') === cleanStr(fieldName) || cleanStr(l.innerText) === cleanStr(fieldName));
                if (lbl) {
                    const wrapper = lbl.closest('.input, .nested-filter, .nested-fields, .__ui-form__select-field, .ember-view');
                    if (wrapper) trigger = wrapper.querySelector('.ember-power-select-trigger');
                }
            }

            if (trigger) break;
            await delay(500); // wait and try finding it again
        }

        if (!trigger) {
            log(`&nbsp;&nbsp;<span style="color:#f33735">❌ Dropdown not found</span>`);
            return;
        }

        if (trigger.closest('.disabledFormField') || trigger.getAttribute('aria-disabled') === "true") {
            log(`&nbsp;&nbsp;<span style="color:#ffcf57">⚠️ Field is currently locked</span>`);
            return;
        }

        const selectedTextNode = trigger.querySelector('.ember-power-select-selected-item');
        if (selectedTextNode && cleanStr(selectedTextNode.innerText) === cleanStr(optionText)) {
            log(`&nbsp;&nbsp;✅ Already set to "${optionText}"`);
            return;
        }

        simulateClick(trigger);
        await delay(500);

        const searchInput = document.querySelector('.ember-power-select-dropdown .ember-power-select-search-input');
        if (searchInput) {
            searchInput.value = optionText;
            searchInput.dispatchEvent(new Event('input', { bubbles: true }));
            await delay(800);
        }

        let targetOption = null;
        for (let i = 0; i < 20; i++) {
            await delay(100);
            const options = Array.from(document.querySelectorAll('.ember-power-select-option'));
            targetOption = options.find(opt => cleanStr(opt.textContent) === cleanStr(optionText));
            if (targetOption) break;
        }

        if (targetOption) {
            simulateClick(targetOption);
            log(`&nbsp;&nbsp;✅ Selected`);
            await delay(1500); // Wait for potential dependent fields to unlock
        } else {
            log(`&nbsp;&nbsp;<span style="color:#f33735">❌ Option missing</span>`);
            simulateClick(trigger);
            await delay(300);
        }
    }

    try {
        log("🚀 <b>Starting Resolution Sequence...</b>");

        // Wait for the ticket page to actually load before starting
        for (let i = 0; i < 10; i++) {
            if (document.querySelector('.ticket-properties-wrapper')) break;
            await delay(500);
        }

        // Perform the Dropdown Selections
        await setDropdownValue("End State Action", "Resolution By The Same Group");
        await setDropdownValue("Agent Category", "TS-Checkout (L2)");
        await setDropdownValue("Agent Sub Category", "Methods Visibility");
        await setDropdownValue("Agent Item", "(High) P0 - Sev4");
        await setDropdownValue("Ticket Queue", "Merchant");

        log("⏳ <b>Updating...</b>");
        await delay(1000);

        // Click the Update Button
        const updateBtn = document.querySelector('[data-test-id="ticket-properties-btn"]');
        if (updateBtn) {
            if (!updateBtn.disabled) {
                updateBtn.click();
                log("🎉 <b style='color:white'>DONE! Ticket Updated.</b>");
            } else {
                log("<span style='color:#ffcf57'>⚠️ Update button is greyed out. Check missing fields.</span>");
            }
        } else {
            log("<span style='color:#f33735'>❌ Update button not found!</span>");
        }

        // Remove the visual log after 8 seconds
        setTimeout(() => {
            const logBox = document.getElementById('fw-auto-log');
            if (logBox) logBox.remove();
        }, 8000);

    } catch (error) {
        log(`<span style="color:#f33735">🚨 ERROR: ${error.message}</span>`);
    }
})();