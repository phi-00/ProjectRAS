import sys
import json
import datetime
import pytz

from PIL import Image, ImageEnhance
import numpy as np

from utils.img_handler import Img_Handler
from utils.tool_msg import ToolMSG
import utils.env as env

class Saturation:
    def __init__(self):
        self._img_handler = Img_Handler()
        self._tool_msg = ToolMSG('picturas-saturation-tool-ms', 
                                 'saturation', 
                                 env.RABBITMQ_HOST, 
                                 env.RABBITMQ_PORT, 
                                 env.RABBITMQ_USERNAME, 
                                 env.RABBITMQ_PASSWORD)
        self._counter = 0
        self._codes = {
            'wrong_procedure': 1700,
            'error_processing': 1701
        }

    def saturation_image(self, img_path, store_img_path, saturation_factor):
        # 1. Carregar a imagem via img_handler
        img = self._img_handler.get_img(img_path)
        
        # 2. Garantir conversão para RGB
        if img.mode != 'RGB':
            img = img.convert('RGB')
        
        # 3. Converter para array NumPy (float32 para precisão nos cálculos)
        img_array = np.array(img).astype(np.float32)
        
        # 4. Lógica de Saturação:
        # Convertemos para o conceito de luminância para ajustar a cor sem afetar o brilho
        # Pesos padrão para luminância: R:0.299, G:0.587, B:0.114
        luminance = (img_array[:, :, 0] * 0.299 + 
                    img_array[:, :, 1] * 0.587 + 
                    img_array[:, :, 2] * 0.114)[:, :, np.newaxis]
        
        # Fórmula: pixel_final = luminância + fator * (pixel_original - luminância)
        img_array = luminance + saturation_factor * (img_array - luminance)
        
        # 5. Normalizar valores entre [0, 255] e converter para o formato de imagem (uint8)
        img_array = np.clip(img_array, 0, 255).astype(np.uint8)
        
        # 6. Criar nova imagem e guardar
        new_img = Image.fromarray(img_array)
        self._img_handler.store_img(new_img, store_img_path)

    def saturation_callback(self, ch, method, properties, body):
        json_str = body.decode()
        info = json.loads(json_str)
        
        msg_id = info['messageId']
        timestamp = datetime.datetime.fromisoformat(info['timestamp'])
        procedure = info['procedure']
        img_path = info['parameters']['inputImageURI']
        store_img_path = info['parameters']['outputImageURI']
        saturation_factor = info['parameters']['saturationFactor']
        
        resp_msg_id = f'saturation-{self._counter}-{msg_id}'
        self._counter += 1

        if procedure != 'saturation':
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(msg_id, 
                                    resp_msg_id, 
                                    cur_timestamp, 
                                    'error', 
                                    processing_time, 
                                    None, 
                                    self._codes['wrong_procedure'], 
                                    "The procedure received does not fit into this tool", 
                                    img_path)
            return

        try:
            self.saturation_image(img_path, store_img_path, saturation_factor)

            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()
            
            self._tool_msg.send_msg(msg_id, 
                                    resp_msg_id, 
                                    cur_timestamp, 
                                    'success', 
                                    processing_time,
                                    store_img_path)
        except Exception as e:
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(msg_id, 
                                    resp_msg_id, 
                                    cur_timestamp, 
                                    'error',
                                    processing_time,
                                    None, 
                                    self._codes['error_processing'], 
                                    str(e), 
                                    img_path)

    def exec(self, args):
        while True:
            self._tool_msg.read_msg(self.saturation_callback)


if __name__ == "__main__":
    saturation = Saturation()
    saturation.exec(sys.argv)