
EXPANDED_INTEL_LAYERS = {
    "liveShips": {
        "source": "AIS adapter / synthetic fallback",
        "adapter": "AISStream, AISHub, MarineTraffic require provider credentials",
        "features": [
            {"id": "ais-atlantic-01", "name": "ATLANTIC MERCHANT", "kind": "moving", "category": "container", "periodHours": 92, "phase": 0.16, "route": [[-74.0, 40.5, 28], [-52.0, 43.8, 28], [-25.0, 49.0, 28], [-5.5, 50.2, 28], [4.3, 51.9, 28]]},
            {"id": "ais-atlantic-02", "name": "NORDIC CARRIER", "kind": "moving", "category": "container", "periodHours": 86, "phase": 0.32, "route": [[-73.8, 40.6, 28], [-48.0, 45.2, 28], [-22.0, 51.0, 28], [-8.0, 53.5, 28], [10.7, 59.9, 28]]},
            {"id": "ais-atlantic-03", "name": "EURO EXPRESS", "kind": "moving", "category": "container", "periodHours": 78, "phase": 0.58, "route": [[4.9, 52.4, 28], [-12.0, 50.0, 28], [-35.0, 47.0, 28], [-58.0, 42.0, 28], [-74.0, 40.7, 28]]},
            
            {"id": "ais-pacific-01", "name": "PACIFIC RUNNER", "kind": "moving", "category": "bulk", "periodHours": 120, "phase": 0.48, "route": [[140.3, 35.0, 28], [166.0, 34.0, 28], [-162.0, 35.2, 28], [-139.0, 37.8, 28], [-122.7, 37.6, 28]]},
            {"id": "ais-pacific-02", "name": "TRANSPACIFIC STAR", "kind": "moving", "category": "container", "periodHours": 132, "phase": 0.22, "route": [[-122.4, 37.8, 28], [-145.0, 40.0, 28], [-175.0, 42.0, 28], [165.0, 38.0, 28], [139.7, 35.6, 28]]},
            {"id": "ais-pacific-03", "name": "ASIA TRADER", "kind": "moving", "category": "container", "periodHours": 96, "phase": 0.74, "route": [[103.8, 1.3, 28], [120.0, 14.0, 28], [135.0, 28.0, 28], [155.0, 35.0, 28], [-168.0, 38.0, 28]]},
            {"id": "ais-pacific-04", "name": "OCEANIA VOYAGER", "kind": "moving", "category": "bulk", "periodHours": 108, "phase": 0.12, "route": [[151.2, -33.9, 28], [165.0, -28.0, 28], [-178.0, -18.0, 28], [-155.0, 21.3, 28], [-157.9, 21.3, 28]]},
            
            {"id": "ais-suez-01", "name": "SUEZ VECTOR", "kind": "moving", "category": "tanker", "periodHours": 58, "phase": 0.71, "route": [[32.3, 29.9, 28], [34.2, 25.3, 28], [39.2, 18.4, 28], [48.7, 14.2, 28], [56.3, 23.7, 28]]},
            {"id": "ais-suez-02", "name": "MEDITERRANEAN LINK", "kind": "moving", "category": "container", "periodHours": 64, "phase": 0.45, "route": [[12.5, 41.9, 28], [18.0, 38.0, 28], [25.0, 35.0, 28], [32.0, 31.0, 28], [34.0, 27.0, 28]]},
            {"id": "ais-suez-03", "name": "RED SEA PASSAGE", "kind": "moving", "category": "tanker", "periodHours": 52, "phase": 0.88, "route": [[56.3, 23.7, 28], [51.0, 20.0, 28], [43.0, 15.0, 28], [38.0, 12.0, 28], [33.0, 27.0, 28]]},
            
            {"id": "ais-indian-01", "name": "INDIAN OCEAN TRADER", "kind": "moving", "category": "bulk", "periodHours": 98, "phase": 0.36, "route": [[72.8, 19.0, 28], [60.0, 10.0, 28], [43.2, -12.0, 28], [18.4, -34.0, 28]]},
            {"id": "ais-indian-02", "name": "MONSOON CARRIER", "kind": "moving", "category": "container", "periodHours": 84, "phase": 0.62, "route": [[103.8, 1.3, 28], [88.0, 6.0, 28], [72.8, 19.0, 28], [56.3, 23.7, 28]]},
            {"id": "ais-indian-03", "name": "CAPE ROUTE", "kind": "moving", "category": "tanker", "periodHours": 112, "phase": 0.18, "route": [[18.4, -34.0, 28], [30.0, -30.0, 28], [50.0, -20.0, 28], [72.8, -8.0, 28], [103.8, 1.3, 28]]},
            
            {"id": "ais-scs-01", "name": "SOUTH CHINA TRADER", "kind": "moving", "category": "container", "periodHours": 48, "phase": 0.54, "route": [[103.8, 1.3, 28], [108.0, 8.0, 28], [114.2, 22.3, 28], [121.5, 31.2, 28]]},
            {"id": "ais-scs-02", "name": "MANILA EXPRESS", "kind": "moving", "category": "container", "periodHours": 56, "phase": 0.28, "route": [[120.9, 14.6, 28], [118.0, 18.0, 28], [114.2, 22.3, 28], [121.5, 25.0, 28], [139.7, 35.6, 28]]},
            {"id": "ais-scs-03", "name": "VIETNAM COASTAL", "kind": "moving", "category": "bulk", "periodHours": 42, "phase": 0.76, "route": [[106.7, 10.8, 28], [108.2, 16.1, 28], [108.2, 21.0, 28], [114.2, 22.3, 28]]},
            
            {"id": "ais-gulf-01", "name": "GULF TRADER", "kind": "moving", "category": "tanker", "periodHours": 38, "phase": 0.42, "route": [[-94.8, 29.3, 28], [-90.0, 29.0, 28], [-85.0, 28.0, 28], [-82.0, 25.0, 28], [-80.2, 25.8, 28]]},
            {"id": "ais-gulf-02", "name": "CARIBBEAN LINK", "kind": "moving", "category": "container", "periodHours": 46, "phase": 0.68, "route": [[-80.2, 25.8, 28], [-76.0, 20.0, 28], [-70.0, 18.5, 28], [-64.0, 18.0, 28], [-61.5, 10.5, 28]]},
            {"id": "ais-gulf-03", "name": "PANAMA PASSAGE", "kind": "moving", "category": "container", "periodHours": 52, "phase": 0.14, "route": [[-79.9, 9.0, 28], [-82.0, 8.0, 28], [-85.0, 10.0, 28], [-90.0, 15.0, 28], [-95.0, 20.0, 28]]},
            
            {"id": "ais-baltic-01", "name": "BALTIC CARRIER", "kind": "moving", "category": "container", "periodHours": 36, "phase": 0.52, "route": [[10.7, 59.9, 28], [15.0, 60.0, 28], [18.0, 59.3, 28], [24.9, 59.4, 28], [28.0, 59.4, 28]]},
            {"id": "ais-baltic-02", "name": "NORDIC LINK", "kind": "moving", "category": "bulk", "periodHours": 44, "phase": 0.84, "route": [[24.9, 59.4, 28], [22.0, 58.0, 28], [18.0, 57.0, 28], [12.0, 56.0, 28], [10.7, 59.9, 28]]},
            
            {"id": "ais-westcoast-01", "name": "PACIFIC COAST RUNNER", "kind": "moving", "category": "container", "periodHours": 68, "phase": 0.38, "route": [[-122.4, 37.8, 28], [-123.0, 42.0, 28], [-124.0, 46.0, 28], [-125.0, 49.0, 28], [-126.0, 52.0, 28]]},
            {"id": "ais-westcoast-02", "name": "LATIN AMERICA EXPRESS", "kind": "moving", "category": "container", "periodHours": 96, "phase": 0.26, "route": [[-122.4, 37.8, 28], [-118.2, 33.7, 28], [-110.0, 24.0, 28], [-90.0, 13.0, 28], [-79.9, 9.0, 28]]},
            {"id": "ais-westcoast-03", "name": "SOUTH PACIFIC TRADER", "kind": "moving", "category": "bulk", "periodHours": 124, "phase": 0.64, "route": [[-79.9, 9.0, 28], [-85.0, -5.0, 28], [-78.0, -12.0, 28], [-70.7, -33.4, 28]]},
            
            {"id": "ais-eastcoast-01", "name": "EASTERN SEABOARD", "kind": "moving", "category": "container", "periodHours": 58, "phase": 0.48, "route": [[-80.2, 25.8, 28], [-79.0, 32.0, 28], [-76.0, 37.0, 28], [-74.0, 40.7, 28], [-71.0, 42.4, 28]]},
            {"id": "ais-eastcoast-02", "name": "ATLANTIC COASTAL", "kind": "moving", "category": "bulk", "periodHours": 64, "phase": 0.72, "route": [[-71.0, 42.4, 28], [-70.0, 43.7, 28], [-66.0, 45.0, 28], [-63.0, 46.8, 28], [-52.7, 47.6, 28]]},
            
            {"id": "ais-anzac-01", "name": "TASMAN TRADER", "kind": "moving", "category": "container", "periodHours": 42, "phase": 0.56, "route": [[151.2, -33.9, 28], [156.0, -32.0, 28], [165.0, -36.0, 28], [174.8, -36.8, 28], [174.8, -41.3, 28]]},
            {"id": "ais-anzac-02", "name": "CORAL SEA PASSAGE", "kind": "moving", "category": "bulk", "periodHours": 52, "phase": 0.34, "route": [[151.2, -33.9, 28], [153.0, -27.5, 28], [149.0, -21.0, 28], [146.8, -19.3, 28], [145.8, -16.9, 28]]},
            
            {"id": "ais-cruise-01", "name": "CARIBBEAN DREAM", "kind": "moving", "category": "cruise", "periodHours": 72, "phase": 0.22, "route": [[-80.2, 25.8, 28], [-81.0, 24.5, 28], [-82.0, 23.0, 28], [-84.0, 21.5, 28], [-87.0, 20.5, 28]]},
            {"id": "ais-cruise-02", "name": "MEDITERRANEAN JEWEL", "kind": "moving", "category": "cruise", "periodHours": 68, "phase": 0.78, "route": [[12.5, 41.9, 28], [14.0, 40.8, 28], [18.0, 40.0, 28], [23.7, 37.9, 28], [25.3, 36.4, 28]]},
        ],
    },
    
    "cyberNetwork": {
        "source": "Cloudflare Radar / RIPE Atlas / BGP adapter fallback",
        "features": [
            {"id": "cyber-na-eu-01", "name": "Transatlantic packet arc", "kind": "arc", "intensity": 0.82, "points": [[-74.0, 40.7, 90000], [-30.0, 52.0, 440000], [0.1, 51.5, 90000]]},
            {"id": "cyber-na-eu-02", "name": "NYC-London fiber", "kind": "arc", "intensity": 0.76, "points": [[-74.0, 40.7, 90000], [-25.0, 50.0, 420000], [-0.1, 51.5, 90000]]},
            {"id": "cyber-na-eu-03", "name": "Boston-Dublin route", "kind": "arc", "intensity": 0.68, "points": [[-71.1, 42.4, 90000], [-35.0, 48.0, 380000], [-6.3, 53.3, 90000]]},
            {"id": "cyber-na-eu-04", "name": "Miami-Madrid link", "kind": "arc", "intensity": 0.64, "points": [[-80.2, 25.8, 90000], [-40.0, 35.0, 360000], [-3.7, 40.4, 90000]]},
            
            {"id": "cyber-apac-us-01", "name": "Pacific routing burst", "kind": "arc", "intensity": 0.78, "points": [[139.7, 35.6, 90000], [178.0, 42.0, 520000], [-122.4, 37.8, 90000]]},
            {"id": "cyber-apac-us-02", "name": "Tokyo-LA backbone", "kind": "arc", "intensity": 0.72, "points": [[139.7, 35.6, 90000], [-175.0, 38.0, 480000], [-118.2, 34.0, 90000]]},
            {"id": "cyber-apac-us-03", "name": "Seoul-Seattle link", "kind": "arc", "intensity": 0.66, "points": [[126.9, 37.6, 90000], [170.0, 45.0, 460000], [-122.3, 47.6, 90000]]},
            {"id": "cyber-apac-us-04", "name": "Singapore-SF route", "kind": "arc", "intensity": 0.58, "points": [[103.8, 1.3, 90000], [165.0, 20.0, 520000], [-122.4, 37.8, 90000]]},
            
            {"id": "cyber-asia-eu-01", "name": "Asia-Europe backbone", "kind": "arc", "intensity": 0.74, "points": [[139.7, 35.6, 90000], [80.0, 45.0, 440000], [13.4, 52.5, 90000]]},
            {"id": "cyber-asia-eu-02", "name": "Singapore-London fiber", "kind": "arc", "intensity": 0.68, "points": [[103.8, 1.3, 90000], [55.0, 30.0, 400000], [-0.1, 51.5, 90000]]},
            {"id": "cyber-asia-eu-03", "name": "Mumbai-Frankfurt route", "kind": "arc", "intensity": 0.62, "points": [[72.8, 19.0, 90000], [45.0, 35.0, 360000], [8.7, 50.1, 90000]]},
            
            {"id": "cyber-na-01", "name": "US East-West backbone", "kind": "arc", "intensity": 0.84, "points": [[-74.0, 40.7, 90000], [-100.0, 40.0, 280000], [-122.4, 37.8, 90000]]},
            {"id": "cyber-na-02", "name": "Chicago-Dallas route", "kind": "arc", "intensity": 0.58, "points": [[-87.6, 41.9, 90000], [-92.0, 36.0, 220000], [-96.8, 32.8, 90000]]},
            {"id": "cyber-na-03", "name": "Seattle-Denver link", "kind": "arc", "intensity": 0.52, "points": [[-122.3, 47.6, 90000], [-112.0, 44.0, 200000], [-104.9, 39.7, 90000]]},
            
            {"id": "cyber-eu-01", "name": "London-Frankfurt backbone", "kind": "arc", "intensity": 0.76, "points": [[-0.1, 51.5, 90000], [4.0, 51.0, 180000], [8.7, 50.1, 90000]]},
            {"id": "cyber-eu-02", "name": "Paris-Amsterdam route", "kind": "arc", "intensity": 0.68, "points": [[2.3, 48.9, 90000], [3.5, 50.5, 160000], [4.9, 52.4, 90000]]},
            {"id": "cyber-eu-03", "name": "Madrid-Rome link", "kind": "arc", "intensity": 0.62, "points": [[-3.7, 40.4, 90000], [7.0, 42.0, 220000], [12.5, 41.9, 90000]]},
            {"id": "cyber-eu-04", "name": "Stockholm-Berlin route", "kind": "arc", "intensity": 0.58, "points": [[18.1, 59.3, 90000], [15.0, 56.0, 180000], [13.4, 52.5, 90000]]},
            
            {"id": "cyber-asia-01", "name": "Tokyo-Seoul backbone", "kind": "arc", "intensity": 0.72, "points": [[139.7, 35.6, 90000], [133.0, 36.0, 160000], [126.9, 37.6, 90000]]},
            {"id": "cyber-asia-02", "name": "Singapore-Hong Kong route", "kind": "arc", "intensity": 0.68, "points": [[103.8, 1.3, 90000], [110.0, 12.0, 200000], [114.2, 22.3, 90000]]},
            {"id": "cyber-asia-03", "name": "Mumbai-Singapore link", "kind": "arc", "intensity": 0.64, "points": [[72.8, 19.0, 90000], [88.0, 10.0, 220000], [103.8, 1.3, 90000]]},
            {"id": "cyber-asia-04", "name": "Beijing-Shanghai route", "kind": "arc", "intensity": 0.76, "points": [[116.4, 39.9, 90000], [119.0, 35.0, 160000], [121.5, 31.2, 90000]]},
            
            {"id": "cyber-me-01", "name": "Dubai-Mumbai link", "kind": "arc", "intensity": 0.58, "points": [[55.3, 25.2, 90000], [64.0, 22.0, 180000], [72.8, 19.0, 90000]]},
            {"id": "cyber-me-02", "name": "Tel Aviv-Frankfurt route", "kind": "arc", "intensity": 0.54, "points": [[34.8, 32.1, 90000], [22.0, 42.0, 280000], [8.7, 50.1, 90000]]},
            
            {"id": "cyber-sa-01", "name": "Sao Paulo-Buenos Aires", "kind": "arc", "intensity": 0.62, "points": [[-46.6, -23.5, 90000], [-52.0, -30.0, 180000], [-58.4, -34.6, 90000]]},
            {"id": "cyber-sa-02", "name": "Miami-Sao Paulo link", "kind": "arc", "intensity": 0.68, "points": [[-80.2, 25.8, 90000], [-58.0, -5.0, 360000], [-46.6, -23.5, 90000]]},
            
            {"id": "cyber-af-01", "name": "Cairo-Johannesburg", "kind": "arc", "intensity": 0.56, "points": [[31.2, 30.0, 90000], [28.0, -10.0, 320000], [28.0, -26.2, 90000]]},
            {"id": "cyber-af-02", "name": "Lagos-London route", "kind": "arc", "intensity": 0.52, "points": [[3.4, 6.5, 90000], [-8.0, 28.0, 320000], [-0.1, 51.5, 90000]]},
            
            {"id": "cyber-au-01", "name": "Sydney-Singapore link", "kind": "arc", "intensity": 0.64, "points": [[151.2, -33.9, 90000], [127.0, -15.0, 340000], [103.8, 1.3, 90000]]},
            {"id": "cyber-au-02", "name": "Sydney-LA route", "kind": "arc", "intensity": 0.58, "points": [[151.2, -33.9, 90000], [-170.0, -20.0, 480000], [-118.2, 34.0, 90000]]},
            
            {"id": "cyber-attack-01", "name": "DDoS mitigation zone", "kind": "arc", "intensity": 0.92, "points": [[-74.0, 40.7, 90000], [-72.0, 41.0, 140000], [-70.0, 41.5, 90000]]},
            {"id": "cyber-attack-02", "name": "BGP hijack detection", "kind": "arc", "intensity": 0.88, "points": [[139.7, 35.6, 90000], [141.0, 36.0, 120000], [142.0, 36.5, 90000]]},
            {"id": "cyber-attack-03", "name": "Routing anomaly", "kind": "arc", "intensity": 0.78, "points": [[13.4, 52.5, 90000], [14.0, 53.0, 100000], [15.0, 53.5, 90000]]},
        ],
    },
}

