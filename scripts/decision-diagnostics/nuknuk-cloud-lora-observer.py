"""Process-local load receipt only; staged as sitecustomize in the probe image."""
import json
import os
from pathlib import Path


def install(directory):
    import torch
    from vllm.lora.lora_model import LoRAModel
    original=LoRAModel.from_local_checkpoint.__func__
    @classmethod
    def observed(cls,*args,**kwargs):
        result=original(cls,*args,**kwargs)
        modules={name:{'aShape':list(layer.lora_a.shape),'bShape':list(layer.lora_b.shape),
            'dtype':str(layer.lora_a.dtype),'scaling':float(layer.scaling),
            'bNonzero':int(torch.count_nonzero(layer.lora_b).item())}for name,layer in result.loras.items()}
        receipt={'adapterId':result.id,'rank':result.rank,'modules':modules,'observerChangesWeights':False}
        path=Path(directory)/('lora-load-'+str(os.getpid())+'.json')
        with path.open('x')as f:json.dump(receipt,f,indent=2)
        return result
    LoRAModel.from_local_checkpoint=observed


if os.environ.get('BACKYRD_LORA_DIR'):
    install(os.environ['BACKYRD_LORA_DIR'])
