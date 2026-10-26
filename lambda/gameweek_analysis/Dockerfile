FROM public.ecr.aws/lambda/python:3.13

COPY requirements.txt ${LAMBDA_TASK_ROOT}/requirements.txt
RUN python -m pip install --no-cache-dir \
    --target "${LAMBDA_TASK_ROOT}" \
    -r "${LAMBDA_TASK_ROOT}/requirements.txt"

COPY analysis.py handler.py ${LAMBDA_TASK_ROOT}/

CMD ["handler.handler"]
