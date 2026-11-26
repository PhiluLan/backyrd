"""Process-local unit-lower inverse VJP candidate; never edits installed files.

Forward substitution remains exactly the installed function. For Y=L^-1,
dL=-Y^T dY Y^T; only strict-lower input entries participate in this function.
No model loading, memory controls, evaluation or stateful math in transforms.
"""
from contextlib import contextmanager


def inverse_with_vjp(original, chunk):
    import mlx.core as mx

    @mx.custom_function
    def inverse(matrix):
        return original(matrix, chunk)

    @inverse.vjp
    def inverse_vjp(primals, cotangent, output):
        transpose = mx.swapaxes(output, -1, -2)
        derivative = -(transpose @ cotangent @ transpose)
        return (mx.tril(derivative, -1),)

    return inverse


@contextmanager
def installed_inverse_vjp(gated_delta):
    original = gated_delta._invert_unit_lower
    cached = {}

    def replaced(matrix, chunk):
        import mlx.core as mx
        if chunk != 64 or matrix.dtype != mx.float32 or matrix.shape[-2:] != (chunk, chunk):
            raise ValueError('unit_lower_inverse_shape_mismatch')
        if chunk not in cached:
            cached[chunk] = inverse_with_vjp(original, chunk)
        return cached[chunk](matrix)

    gated_delta._invert_unit_lower = replaced
    try:
        yield
    finally:
        gated_delta._invert_unit_lower = original
