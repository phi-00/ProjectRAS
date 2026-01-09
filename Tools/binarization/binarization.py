import sys
import json
import datetime

import pytz

from PIL import Image, ImageOps
import numpy as np

from utils.img_handler import Img_Handler
from utils.tool_msg import ToolMSG
import utils.env as env

class Binarization:
    def __init__(self):
        self._img_handler = Img_Handler()
        self._tool_msg = ToolMSG('picturas-binarization-tool-ms', 
                                 'binarization', 
                                 env.RABBITMQ_HOST, 
                                 env.RABBITMQ_PORT, 
                                 env.RABBITMQ_USERNAME, 
                                 env.RABBITMQ_PASSWORD)
        self._counter = 0
        self._codes = {
            'wrong_procedure': 1100,
            'error_processing': 1101
        }

    def add_binarization(self, img_path, output_path, threshold):
        # 1. Carregar a imagem via handler
        img = self._img_handler.get_img(img_path)

        # 2. Converter para tons de cinza conforme a lógica original
        grayscale_img = ImageOps.grayscale(img)
        
        # 3. Converter para array NumPy para processamento instantâneo
        img_array = np.array(grayscale_img)

        # 4. Lógica de Binarização Vetorizada:
        # Cria uma matriz onde píxeis < threshold tornam-se 0 e os restantes 255
        # Esta operação em matriz é ordens de grandeza mais rápida que o .point(lambda)
        binary_array = np.where(img_array < threshold, 0, 255).astype(np.uint8)

        # 5. Converter de volta para objeto Image e guardar
        new_img = Image.fromarray(binary_array)
        self._img_handler.store_img(new_img, output_path)

    def binarization_callback(self, ch, method, properties, body):
        json_str = body.decode()
        info = json.loads(json_str)

        msg_id = info['messageId']
        timestamp = datetime.datetime.fromisoformat(info['timestamp'])
        procedure = info['procedure']
        img_path = info['parameters']['inputImageURI']
        store_img_path = info['parameters']['outputImageURI']
        threshold = info['parameters']['threshold']

        resp_msg_id = f'binarization-{self._counter}-{msg_id}'
        self._counter += 1

        if procedure != 'binarization':
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(msg_id, resp_msg_id, cur_timestamp, 'error', processing_time, None, self._codes['wrong_procedure'], "The procedure received does not fit into this tool", img_path)
            return

        try:
            self.add_binarization(img_path, store_img_path, threshold)

            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(msg_id, resp_msg_id, cur_timestamp, 'success', processing_time, store_img_path)
        except Exception as e:
            cur_timestamp = datetime.datetime.now(pytz.utc)
            processing_time = (cur_timestamp - timestamp).total_seconds() * 1000
            cur_timestamp = cur_timestamp.isoformat()

            self._tool_msg.send_msg(msg_id, resp_msg_id, cur_timestamp, 'error', processing_time, None, self._codes['error_processing'], str(e), img_path)

    def exec(self, args):
        while True:
            self._tool_msg.read_msg(self.binarization_callback)

if __name__ == '__main__':
    binarization = Binarization()
    binarization.exec(sys.argv)