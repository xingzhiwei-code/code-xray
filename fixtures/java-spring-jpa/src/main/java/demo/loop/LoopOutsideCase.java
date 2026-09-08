package demo.loop;

import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Service;

/** oracle: loop-outside — NEGATIVE. Same repository call, but not inside any loop. */
@Service
public class LoopOutsideCase {

    private final LoopOutsideOrderRepository orderRepository;

    public LoopOutsideCase(LoopOutsideOrderRepository orderRepository) {
        this.orderRepository = orderRepository;
    }

    public void save(LoopOutsideOrder order) {
        orderRepository.save(order);
    }
}

interface LoopOutsideOrderRepository extends JpaRepository<LoopOutsideOrder, Long> {
}

class LoopOutsideOrder {
}
