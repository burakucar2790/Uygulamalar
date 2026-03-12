document.addEventListener('DOMContentLoaded', function() {
    var calculator = {
        displayValue: '0',
        firstOperand: null,
        waitingForSecondOperand: false,
        operator: null,
        calculationHistory: []
    };

    var historyDisplay = document.querySelector('.calculator-history');
    var historyLog = document.querySelector('.history-log');
    var modalOverlay = document.querySelector('.modal-overlay');
    var clearHistoryBtn = document.querySelector('.clear-history');
    var historyToggleBtn = document.querySelector('.history-toggle');
    var closeHistoryPanelBtn = document.querySelector('.close-history-panel');

    
    function updateDisplay() {
        var display = document.querySelector('.calculator-display');
        var value = calculator.displayValue;
        
        if (value.length > 15) {
            value = parseFloat(value).toExponential(9);
        }
        
        display.textContent = value;

        if (value.length > 9) {
            display.style.fontSize = '4rem';
        } else if (value.length > 6) {
            display.style.fontSize = '5rem';
        } else {
            display.style.fontSize = '6rem';
        }
    }

    updateDisplay();

    function renderHistory() {
        historyLog.innerHTML = '';
        // En son işlemi en üstte göstermek için diziyi ters çevirip döngüye alıyoruz
        var reversedHistory = calculator.calculationHistory.slice().reverse();
        reversedHistory.forEach(function(entry) {
            var entryElement = document.createElement('div');
            entryElement.textContent = entry;
            historyLog.appendChild(entryElement);
        });
    }

    function openHistoryModal() {
        if (modalOverlay) {
            modalOverlay.classList.remove('hidden');
        }
    }

    function closeHistoryModal() {
        if (modalOverlay) {
            modalOverlay.classList.add('hidden');
        }
    }

    if (clearHistoryBtn) {
        clearHistoryBtn.addEventListener('click', function() {
            calculator.calculationHistory = [];
            renderHistory();
        });
    }
    
    if (historyToggleBtn) {
        historyToggleBtn.addEventListener('click', openHistoryModal);
    }

    if (closeHistoryPanelBtn) {
        closeHistoryPanelBtn.addEventListener('click', closeHistoryModal);
    }

    if (modalOverlay) {
        modalOverlay.addEventListener('click', function(event) {
            if (event.target === modalOverlay) {
                closeHistoryModal();
            }
        });
    }

    document.addEventListener('keydown', function(event) {
        if (event.key === 'Escape' && modalOverlay && !modalOverlay.classList.contains('hidden')) {
            closeHistoryModal();
        }
    });

    // Başlangıçta geçmişi render et (eğer localStorage vb. ile veri saklansaydı)
    renderHistory();

    var keys = document.querySelector('.calculator-keys');
    keys.addEventListener('click', function(event) {
        var target = event.target;
        if (!target.matches('button')) {
            return;
        }

        var action = target.dataset.action;
        var keyContent = target.textContent;

        if (!action) {
            inputDigit(keyContent);
        } else if (action === 'decimal') {
            inputDecimal(keyContent);
        } else if (action === 'add' || action === 'subtract' || action === 'multiply' || action === 'divide') {
            handleOperator(action);
        } else if (action === 'calculate') {
            handleEquals();
        } else if (action === 'clear') {
            resetCalculator();
        } else if (action === 'negate') {
            toggleSign();
        } else if (action === 'percent') {
            inputPercent();
        }
        
        updateDisplay();
    });

    function inputDigit(digit) {
        var displayValue = calculator.displayValue;
        var waitingForSecondOperand = calculator.waitingForSecondOperand;

        if (waitingForSecondOperand === true) {
            calculator.displayValue = digit;
            calculator.waitingForSecondOperand = false;
        } else {
            calculator.displayValue = displayValue === '0' ? digit : displayValue + digit;
        }
    }

    function inputDecimal(dot) {
        if (calculator.waitingForSecondOperand === true) {
            calculator.displayValue = '0.';
            calculator.waitingForSecondOperand = false;
            return;
        }

        if (calculator.displayValue.indexOf(dot) === -1) {
            calculator.displayValue += dot;
        }
    }

    function handleOperator(nextOperator) {
        var firstOperand = calculator.firstOperand;
        var displayValue = calculator.displayValue;
        var operator = calculator.operator;
        var inputValue = parseFloat(displayValue);

        if (operator && calculator.waitingForSecondOperand) {
            calculator.operator = nextOperator;
            historyDisplay.textContent = firstOperand + ' ' + getOperatorSymbol(nextOperator);
            return;
        }

        if (firstOperand === null && !isNaN(inputValue)) {
            calculator.firstOperand = inputValue;
        } else if (operator) {
            var result = calculate(firstOperand, inputValue, operator);
            if (result === 'Error') {
                showError();
                return;
            }
            var resultString = String(parseFloat(result.toFixed(7)));
            calculator.displayValue = resultString;
            calculator.firstOperand = parseFloat(resultString);
        }

        calculator.waitingForSecondOperand = true;
        calculator.operator = nextOperator;
        historyDisplay.textContent = calculator.firstOperand + ' ' + getOperatorSymbol(nextOperator);
    }

    function calculate(first, second, op) {
        if (op === 'add') return first + second;
        if (op === 'subtract') return first - second;
        if (op === 'multiply') return first * second;
        if (op === 'divide') return second === 0 ? 'Error' : first / second;
        return second;
    }

    function handleEquals() {
        var firstOperand = calculator.firstOperand;
        var displayValue = calculator.displayValue;
        var operator = calculator.operator;
        
        if (operator === null || firstOperand === null) {
            return;
        }

        var secondOperand = parseFloat(displayValue);
        var result = calculate(firstOperand, secondOperand, operator);

        if (result === 'Error') {
            showError();
            return;
        }

        var resultString = String(parseFloat(result.toFixed(7)));
        var historyEntry = firstOperand + ' ' + getOperatorSymbol(operator) + ' ' + secondOperand + ' = ' + resultString;

        historyDisplay.textContent = historyEntry;
        calculator.displayValue = resultString;
        calculator.firstOperand = null;
        calculator.operator = null;
        calculator.waitingForSecondOperand = true;
        calculator.calculationHistory.push(historyEntry);
        renderHistory();
    }

    function resetCalculator() {
        calculator.displayValue = '0';
        calculator.firstOperand = null;
        calculator.waitingForSecondOperand = false;
        calculator.operator = null;
        historyDisplay.textContent = '';
        // AC'ye basıldığında ana geçmiş listesi temizlenmez, istenirse eklenebilir.
    }

    function toggleSign() {
        if (calculator.displayValue === '0' || calculator.displayValue === 'Error') return;
        calculator.displayValue = String(parseFloat(calculator.displayValue) * -1);
    }

    function inputPercent() {
        if (calculator.displayValue === 'Error') return;
        calculator.displayValue = String(parseFloat(calculator.displayValue) / 100);
    }

    function getOperatorSymbol(op) {
        var symbols = { add: '+', subtract: '−', multiply: '×', divide: '÷' };
        return symbols[op] || '';
    }

    function showError() {
        calculator.displayValue = 'Error';
        historyDisplay.textContent = '';
        setTimeout(function() {
            if (calculator.displayValue === 'Error') {
                resetCalculator();
                updateDisplay();
            }
        }, 1500);
    }
});