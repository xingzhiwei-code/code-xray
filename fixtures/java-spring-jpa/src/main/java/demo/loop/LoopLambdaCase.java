package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-lambda — UNKNOWN. Repository call deferred inside a lambda; timing unknown. */
@Service
public class LoopLambdaCase {

    private final LoopLambdaOrderRepository orderRepository;

    public LoopLambdaCase(LoopLambdaOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void restock(List<LoopLambdaOrder> orders) {
        for (LoopLambdaOrder order : orders) {
            enqueue(order, () -> orderRepository.save(order));
        }
    }

    private void enqueue(LoopLambdaOrder order, Runnable action) {
    }
}

interface LoopLambdaOrderRepository extends JpaRepository<LoopLambdaOrder, Long> {
}

class LoopLambdaOrder {
}
