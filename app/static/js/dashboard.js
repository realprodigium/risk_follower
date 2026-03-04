let chart = null;
let dataHistory = {
    timestamps: [],
    temperature: [],
    humidity: [],
    co2: []
};
let recentRecords = [];
const MAX_DATA_POINTS = 50;
let websocket = null;
let ws_reconnect_attempts = 0;
const WS_MAX_RECONNECT_ATTEMPTS = 5;
const WS_RECONNECT_DELAY = 3000;

document.addEventListener('DOMContentLoaded', () => {
    initializeChart();
    connectWebSocket();
    setupChartControls();
});

function initializeChart() {
    const options = {
        series: [
            {
                name: 'Temperature (°C)',
                data: []
            },
            {
                name: 'Humidity (%)',
                data: []
            },
            {
                name: 'CO2 (PPM)',
                data: []
            }
        ],
        chart: {
            type: 'line',
            height: 400,
            background: 'transparent',
            foreColor: '#a3a3a3',
            fontFamily: 'JetBrains Mono, monospace',
            animations: {
                enabled: true,
                easing: 'linear',
                dynamicAnimation: {
                    speed: 1000
                }
            },
            toolbar: {
                show: false
            },
            zoom: {
                enabled: false
            }
        },
        colors: ['#ef4444', '#3b82f6', '#10b981'],
        stroke: {
            curve: 'smooth',
            width: 2
        },
        grid: {
            borderColor: '#262626',
            strokeDashArray: 0,
            xaxis: {
                lines: {
                    show: true
                }
            },
            yaxis: {
                lines: {
                    show: true
                }
            }
        },
        dataLabels: {
            enabled: false
        },
        xaxis: {
            type: 'datetime',
            labels: {
                style: {
                    colors: '#737373',
                    fontSize: '10px',
                    fontWeight: 500
                },
                datetimeFormatter: {
                    hour: 'HH:mm',
                    minute: 'HH:mm:ss'
                }
            },
            axisBorder: {
                show: true,
                color: '#262626'
            },
            axisTicks: {
                show: true,
                color: '#262626'
            }
        },
        yaxis: [
            {
                title: {
                    text: 'Temperature (°C)',
                    style: {
                        color: '#ef4444',
                        fontSize: '11px',
                        fontWeight: 600
                    }
                },
                labels: {
                    style: {
                        colors: '#737373',
                        fontSize: '10px'
                    }
                },
                min: 0,
                max: 50
            },
            {
                opposite: true,
                title: {
                    text: 'Humidity (%)',
                    style: {
                        color: '#3b82f6',
                        fontSize: '11px',
                        fontWeight: 600
                    }
                },
                labels: {
                    style: {
                        colors: '#737373',
                        fontSize: '10px'
                    }
                },
                min: 0,
                max: 100
            },
            {
                opposite: true,
                title: {
                    text: 'CO2 (PPM)',
                    style: {
                        color: '#10b981',
                        fontSize: '11px',
                        fontWeight: 600
                    }
                },
                labels: {
                    style: {
                        colors: '#737373',
                        fontSize: '10px'
                    }
                },
                min: 0,
                max: 2000
            }
        ],
        legend: {
            show: true,
            position: 'top',
            horizontalAlign: 'left',
            labels: {
                colors: '#a3a3a3'
            },
            markers: {
                width: 8,
                height: 8
            }
        },
        tooltip: {
            theme: 'dark',
            x: {
                format: 'HH:mm:ss'
            },
            style: {
                fontSize: '11px',
                fontFamily: 'JetBrains Mono, monospace'
            }
        }
    };

    chart = new ApexCharts(document.querySelector("#main-chart"), options);
    chart.render();
}

function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/sensor-data`;
    
    console.log(`Conectando a WebSocket: ${wsUrl}`);
    
    websocket = new WebSocket(wsUrl);
    
    websocket.onopen = (event) => {
        console.log('WebSocket conexión establecida');
        ws_reconnect_attempts = 0;
        updateConnectionStatus(true);
    };
    
    websocket.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            
            if (data.type === 'historical' || data.type === 'realtime') {
                const sensorData = {
                    timestamp: new Date(data.timestamp),
                    hardware: data.hardware,
                    temperature: parseFloat(data.temperature),
                    humidity: parseFloat(data.humidity),
                    co2: parseFloat(data.co2),
                    risk: data.risk
                };
                
                if (data.type === 'realtime' || !isDataDuplicate(sensorData)) {
                    updateDashboard(sensorData);
                }
            }
        } catch (error) {
            console.error('Error procesando mensaje WebSocket:', error);
        }
    };
    
    websocket.onerror = (error) => {
        console.error('Error WebSocket:', error);
        updateConnectionStatus(false);
    };
    
    websocket.onclose = (event) => {
        console.log('WebSocket desconectado');
        updateConnectionStatus(false);
        
        if (ws_reconnect_attempts < WS_MAX_RECONNECT_ATTEMPTS) {
            ws_reconnect_attempts++;
            console.log(`Reintentando conexión (${ws_reconnect_attempts}/${WS_MAX_RECONNECT_ATTEMPTS}) en ${WS_RECONNECT_DELAY}ms...`);
            setTimeout(connectWebSocket, WS_RECONNECT_DELAY);
        }
    };
}

function isDataDuplicate(newData) {
    if (recentRecords.length === 0) return false;
    
    const lastRecord = recentRecords[0];
    return (
        Math.abs(lastRecord.timestamp - newData.timestamp) < 100 &&
        lastRecord.hardware === newData.hardware
    );
}

function updateConnectionStatus(isConnected) {
    const statusIndicator = document.querySelector('.connection-status');
    if (statusIndicator) {
        statusIndicator.classList.toggle('connected', isConnected);
        statusIndicator.title = isConnected ? 'Conectado' : 'Desconectado';
    }
}
function updateDashboard(data) {
    updateGauges(data);

    updateChart(data);
    
    updateTable(data);
}

function updateGauges(data) {
    const tempValue = document.getElementById('temp-value');
    const tempBar = document.getElementById('temp-bar');
    tempValue.textContent = data.temperature.toFixed(1);
    tempBar.style.width = `${(data.temperature / 50) * 100}%`;
    
    const humidityValue = document.getElementById('humidity-value');
    const humidityBar = document.getElementById('humidity-bar');
    humidityValue.textContent = data.humidity.toFixed(1);
    humidityBar.style.width = `${data.humidity}%`;
    
    const co2Value = document.getElementById('co2-value');
    const co2Bar = document.getElementById('co2-bar');
    co2Value.textContent = data.co2.toFixed(0);
    co2Bar.style.width = `${(data.co2 / 2000) * 100}%`;
}

function updateChart(data) {
    dataHistory.timestamps.push(data.timestamp.getTime());
    dataHistory.temperature.push(data.temperature);
    dataHistory.humidity.push(data.humidity);
    dataHistory.co2.push(data.co2);
    
    if (dataHistory.timestamps.length > MAX_DATA_POINTS) {
        dataHistory.timestamps.shift();
        dataHistory.temperature.shift();
        dataHistory.humidity.shift();
        dataHistory.co2.shift();
    }
    
    const tempData = dataHistory.timestamps.map((time, i) => ({
        x: time,
        y: dataHistory.temperature[i]
    }));
    
    const humidityData = dataHistory.timestamps.map((time, i) => ({
        x: time,
        y: dataHistory.humidity[i]
    }));
    
    const co2Data = dataHistory.timestamps.map((time, i) => ({
        x: time,
        y: dataHistory.co2[i]
    }));
    
    chart.updateSeries([
        { data: tempData },
        { data: humidityData },
        { data: co2Data }
    ], false);
}

function updateTable(data) {
    recentRecords.unshift(data);
    
    if (recentRecords.length > 5) {
        recentRecords.pop();
    }
    
    const tbody = document.getElementById('data-table-body');
    tbody.innerHTML = recentRecords.map(record => `
        <tr>
            <td>
                <div class="table-timestamp">
                    ${formatTimestamp(record.timestamp)}
                </div>
            </td>
            <td>
                <span class="table-source">${record.hardware}</span>
            </td>
            <td>
                <span class="table-value" style="color: #ef4444;">
                    ${record.temperature.toFixed(1)}°C
                </span>
            </td>
            <td>
                <span class="table-value" style="color: #3b82f6;">
                    ${record.humidity.toFixed(1)}%
                </span>
            </td>
            <td>
                <span class="table-value" style="color: #10b981;">
                    ${record.co2.toFixed(0)} PPM
                </span>
            </td>
            <td>
                <span class="status-badge status-${record.risk}">
                    ${record.risk}
                </span>
            </td>
        </tr>
    `).join('');
}

function setupChartControls() {
    const buttons = document.querySelectorAll('.chart-btn');
    
    buttons.forEach(button => {
        button.addEventListener('click', () => {
            buttons.forEach(btn => btn.classList.remove('active'));
            
            button.classList.add('active');
            
            const timerange = button.dataset.timerange;
            
            console.log(`Timerange changed to: ${timerange}`);
        });
    });
}

function formatTimestamp(date) {
    const pad = (n) => n.toString().padStart(2, '0');
    
    const hours = pad(date.getHours());
    const minutes = pad(date.getMinutes());
    const seconds = pad(date.getSeconds());
    
    const day = pad(date.getDate());
    const month = pad(date.getMonth() + 1);
    const year = date.getFullYear();
    
    return `${day}/${month}/${year} ${hours}:${minutes}:${seconds}`;
}

function exportToCSV() {
    let csv = 'Timestamp,Hardware,Temperature,Humidity,CO2,Risk\n';
    
    recentRecords.forEach(record => {
        csv += `${formatTimestamp(record.timestamp)},`;
        csv += `${record.hardware},`;
        csv += `${record.temperature},`;
        csv += `${record.humidity},`;
        csv += `${record.co2},`;
        csv += `${record.risk}\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `co2_monitor_${Date.now()}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    const exportLink = document.querySelector('.nav-link:nth-child(4)');
    if (exportLink) {
        exportLink.addEventListener('click', (e) => {
            e.preventDefault();
            exportToCSV();
        });
    }
});