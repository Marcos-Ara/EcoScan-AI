import json
import math
import os
from datetime import datetime, timezone
from typing import Any

import httpx
import psycopg
from fastapi import Depends, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

DATABASE_URL = os.getenv('DATABASE_URL', 'postgresql://postgres:postgres@localhost:5432/ecoscan')
DEV_MODE = os.getenv('DEV_MODE', 'true').lower() == 'true'
OVERPASS_URL = os.getenv('OVERPASS_URL', 'https://overpass-api.de/api/interpreter')

app = FastAPI(title='EcoScan AI API', version='1.0.0')
app.add_middleware(CORSMiddleware, allow_origins=['*'], allow_credentials=False, allow_methods=['*'], allow_headers=['*'])

try:
    import firebase_admin
    from firebase_admin import auth as firebase_auth, credentials
    FIREBASE_ENABLED = True
except Exception:
    FIREBASE_ENABLED = False

if FIREBASE_ENABLED and not firebase_admin._apps:
    service_json = os.getenv('FIREBASE_SERVICE_ACCOUNT_JSON')
    service_file = os.getenv('FIREBASE_SERVICE_ACCOUNT_FILE')
    if service_json:
        firebase_admin.initialize_app(credentials.Certificate(json.loads(service_json)))
    elif service_file and os.path.exists(service_file):
        firebase_admin.initialize_app(credentials.Certificate(service_file))
    else:
        FIREBASE_ENABLED = False

class DetectionIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    category: str = Field(min_length=1, max_length=40)
    bin: str = Field(min_length=1, max_length=80)
    destination: str = Field(default='')
    decomposition: str = Field(default='')
    fact: str = Field(default='')
    confidence: float | None = Field(default=None, ge=0, le=1)
    source: str = Field(default='camera', max_length=20)
    model: str = Field(default='COCO-SSD', max_length=60)

class EcoPointSearch(BaseModel):
    pass


def db():
    return psycopg.connect(DATABASE_URL)


def get_user_uid(authorization: str | None = Header(default=None)) -> str:
    if authorization and authorization.startswith('Bearer '):
        token = authorization.removeprefix('Bearer ').strip()
        if FIREBASE_ENABLED:
            try:
                decoded = firebase_auth.verify_id_token(token)
                return decoded['uid']
            except Exception as exc:
                raise HTTPException(401, f'Firebase token inválido: {exc}')
    if DEV_MODE:
        return os.getenv('DEV_UID', 'dev-user')
    raise HTTPException(401, 'Autenticação necessária.')


def ensure_user(conn, uid: str) -> None:
    with conn.cursor() as cur:
        cur.execute('INSERT INTO users(uid) VALUES (%s) ON CONFLICT (uid) DO NOTHING', (uid,))
    conn.commit()


@app.get('/health')
def health() -> dict[str, Any]:
    try:
        with db() as conn:
            with conn.cursor() as cur:
                cur.execute('SELECT 1')
                cur.fetchone()
        return {'status': 'ok', 'database': 'connected', 'firebase': FIREBASE_ENABLED}
    except Exception as exc:
        return {'status': 'degraded', 'database': str(exc), 'firebase': FIREBASE_ENABLED}


@app.get('/api/detections')
def list_detections(limit: int = Query(100, ge=1, le=200), uid: str = Depends(get_user_uid)):
    with db() as conn:
        ensure_user(conn, uid)
        with conn.cursor() as cur:
            cur.execute('''SELECT id, name, category, bin, destination, decomposition, fact, confidence, source, model, detected_at FROM detections WHERE uid=%s ORDER BY detected_at DESC LIMIT %s''', (uid, limit))
            rows = cur.fetchall()
    return {'items': [row_to_detection(row) for row in rows]}


@app.post('/api/detections')
def create_detection(payload: DetectionIn, uid: str = Depends(get_user_uid)):
    with db() as conn:
        ensure_user(conn, uid)
        with conn.cursor() as cur:
            cur.execute('''INSERT INTO detections(uid,name,category,bin,destination,decomposition,fact,confidence,source,model) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING id, name, category, bin, destination, decomposition, fact, confidence, source, model, detected_at''', (uid,payload.name,payload.category,payload.bin,payload.destination,payload.decomposition,payload.fact,payload.confidence,payload.source,payload.model))
            row = cur.fetchone()
        conn.commit()
    return {'item': row_to_detection(row)}


@app.get('/api/profile')
def profile(uid: str = Depends(get_user_uid)):
    with db() as conn:
        ensure_user(conn, uid)
        with conn.cursor() as cur:
            cur.execute('SELECT COUNT(*), COALESCE(eco_point_searches,0) FROM detections d JOIN users u ON u.uid=d.uid WHERE d.uid=%s GROUP BY u.eco_point_searches', (uid,))
            row = cur.fetchone()
            if row is None:
                cur.execute('SELECT COALESCE(eco_point_searches,0) FROM users WHERE uid=%s', (uid,))
                searches = cur.fetchone()[0]
                total = 0
            else:
                total, searches = row
    return {'totalDetections': total, 'ecoPointSearches': searches, 'points': total * 10}


@app.post('/api/profile/ecopoint-search')
def register_ecopoint_search(_: EcoPointSearch, uid: str = Depends(get_user_uid)):
    with db() as conn:
        ensure_user(conn, uid)
        with conn.cursor() as cur:
            cur.execute('UPDATE users SET eco_point_searches = eco_point_searches + 1 WHERE uid=%s RETURNING eco_point_searches', (uid,))
            searches = cur.fetchone()[0]
        conn.commit()
    return {'ecoPointSearches': searches}


@app.get('/api/ecopoints')
async def ecopoints(lat: float = Query(..., ge=-90, le=90), lon: float = Query(..., ge=-180, le=180), radius: int = Query(8000, ge=500, le=25000), uid: str = Depends(get_user_uid)):
    query = f'''[out:json][timeout:25];(node[amenity=recycling](around:{radius},{lat},{lon});way[amenity=recycling](around:{radius},{lat},{lon});relation[amenity=recycling](around:{radius},{lat},{lon});node[amenity=waste_disposal](around:{radius},{lat},{lon}););out center tags;'''
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response = await client.post(OVERPASS_URL, data={'data': query})
            response.raise_for_status()
            data = response.json()
    except Exception as exc:
        raise HTTPException(502, f'Não foi possível consultar os EcoPontos: {exc}')
    items=[]
    for element in data.get('elements',[]):
        e_lat = element.get('lat', element.get('center',{}).get('lat'))
        e_lon = element.get('lon', element.get('center',{}).get('lon'))
        if e_lat is None or e_lon is None: continue
        tags = element.get('tags',{})
        name = tags.get('name') or tags.get('operator') or 'Ponto de descarte/reciclagem'
        amenity = tags.get('amenity','recycling')
        typ = 'EcoPonto / reciclagem' if amenity == 'recycling' else 'Local para descarte'
        if tags.get('recycling_type') == 'centre': typ = 'Centro de reciclagem'
        distance = haversine(lat,lon,e_lat,e_lon)
        items.append({'name':name,'type':typ,'lat':e_lat,'lon':e_lon,'distanceMeters':distance})
    items.sort(key=lambda x:x['distanceMeters'])
    return {'items': items[:60]}


def haversine(lat1, lon1, lat2, lon2):
    r=6371000
    p1=math.radians(lat1); p2=math.radians(lat2)
    dp=math.radians(lat2-lat1); dl=math.radians(lon2-lon1)
    a=math.sin(dp/2)**2+math.cos(p1)*math.cos(p2)*math.sin(dl/2)**2
    return 2*r*math.asin(math.sqrt(a))


def row_to_detection(row):
    return {'id':row[0],'name':row[1],'category':row[2],'bin':row[3],'destination':row[4],'decomposition':row[5],'fact':row[6],'confidence':row[7],'source':row[8],'model':row[9],'detectedAt':row[10].replace(tzinfo=timezone.utc).isoformat() if isinstance(row[10], datetime) and row[10].tzinfo is None else row[10].isoformat() if isinstance(row[10], datetime) else row[10]}
